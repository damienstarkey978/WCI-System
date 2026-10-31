/**
 * JAX EPICS submit seam (batch 5).
 *
 * Hard rules (CLAUDE.md / permit-rockstar-package-rebuild.md §F):
 * - Never submit to JAX EPICS without an explicit staff click for that package.
 * - Never auto-retry a step that may already have succeeded → NEEDS_REVIEW.
 * - Passwords stay encrypted at rest; decrypt only for an out-of-band worker
 *   via readCityPortalPasswordForWorker — never return to the client or logs.
 * - Playwright against live EPICS cannot run inside Netlify's ~60s serverless
 *   limit. This module only QUEUES work. A dedicated worker (office Mac mini /
 *   long-running background process) claims QUEUED rows and drives the browser.
 */

import { CityPortalKind, EpicsSubmitStatus } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { getPermitPackage, PermitPackageError } from "@/lib/permitting/packages";
import { listCityPortalCredentials } from "@/lib/permitting/package-settings";

export class EpicsSeamError extends Error {
  constructor(
    message: string,
    readonly code:
      | "not_found"
      | "validation"
      | "credentials_missing"
      | "already_queued"
      | "worker_disabled" = "validation",
  ) {
    super(message);
    this.name = "EpicsSeamError";
  }
}

export type EpicsSubmitRequestView = {
  readonly id: string;
  readonly packageId: string;
  readonly status: EpicsSubmitStatus;
  readonly requestedAt: Date;
  readonly claimedAt: Date | null;
  readonly finishedAt: Date | null;
  readonly lastError: string | null;
  readonly resultPermitNumber: string | null;
  readonly failureScreenshotUrl: string | null;
};

function toView(row: {
  id: string;
  packageId: string;
  status: EpicsSubmitStatus;
  requestedAt: Date;
  claimedAt: Date | null;
  finishedAt: Date | null;
  lastError: string | null;
  resultPermitNumber: string | null;
  failureScreenshotUrl: string | null;
}): EpicsSubmitRequestView {
  return {
    id: row.id,
    packageId: row.packageId,
    status: row.status,
    requestedAt: row.requestedAt,
    claimedAt: row.claimedAt,
    finishedAt: row.finishedAt,
    lastError: row.lastError,
    resultPermitNumber: row.resultPermitNumber,
    failureScreenshotUrl: row.failureScreenshotUrl,
  };
}

export async function isJaxEpicsConnected(organizationId: string): Promise<boolean> {
  const portals = await listCityPortalCredentials(organizationId);
  return portals.some((p) => p.portal === CityPortalKind.JAX_EPICS && p.connected);
}

export async function latestEpicsSubmitForPackage(
  organizationId: string,
  packageId: string,
): Promise<EpicsSubmitRequestView | null> {
  const row = await db.epicsSubmitRequest.findFirst({
    where: { organizationId, packageId },
    orderBy: { requestedAt: "desc" },
  });
  return row ? toView(row) : null;
}

export async function listEpicsSubmitRequestsForPackage(
  organizationId: string,
  packageId: string,
): Promise<EpicsSubmitRequestView[]> {
  const rows = await db.epicsSubmitRequest.findMany({
    where: { organizationId, packageId },
    orderBy: { requestedAt: "desc" },
  });
  return rows.map(toView);
}

/**
 * Explicit staff action: queue a city-permit submit for the out-of-band worker.
 * Does NOT open a browser, does NOT call JAX EPICS, does NOT decrypt passwords.
 */
export async function requestEpicsCityPermitSubmit(
  organizationId: string,
  packageId: string,
  input: { readonly requestedByUserId?: string | null } = {},
): Promise<EpicsSubmitRequestView> {
  const pkg = await getPermitPackage(organizationId, packageId).catch((error) => {
    if (error instanceof PermitPackageError) {
      throw new EpicsSeamError(error.message, error.code === "not_found" ? "not_found" : "validation");
    }
    throw error;
  });

  if (!(await isJaxEpicsConnected(organizationId))) {
    throw new EpicsSeamError(
      "Connect JAX EPICS credentials under Settings → Permitting before initiating a city permit request.",
      "credentials_missing",
    );
  }

  const open = await db.epicsSubmitRequest.findFirst({
    where: {
      organizationId,
      packageId,
      status: { in: [EpicsSubmitStatus.QUEUED, EpicsSubmitStatus.RUNNING] },
    },
  });
  if (open) {
    throw new EpicsSeamError(
      "A city permit request is already queued or running for this package.",
      "already_queued",
    );
  }

  const row = await db.$transaction(async (tx) => {
    const created = await tx.epicsSubmitRequest.create({
      data: {
        organizationId,
        packageId,
        status: EpicsSubmitStatus.QUEUED,
        requestedByUserId: input.requestedByUserId ?? null,
        steps: [
          {
            id: "queued",
            at: new Date().toISOString(),
            note: "Queued by explicit staff click. Awaiting out-of-band Playwright worker.",
          },
        ],
      },
    });
    if (!pkg.initiatedAt) {
      await tx.permitPackage.update({
        where: { id: packageId },
        data: { initiatedAt: new Date() },
      });
    }
    return created;
  });

  return toView(row);
}

/**
 * Worker entrypoint stub. Live browser automation against JAX EPICS is
 * intentionally NOT implemented in this Netlify-hosted app.
 *
 * External worker contract:
 * 1. Poll QUEUED rows (or listen for webhook/queue).
 * 2. Atomically claim → RUNNING (only if still QUEUED).
 * 3. Decrypt creds via readCityPortalPasswordForWorker (server-side only).
 * 4. Drive Playwright steps idempotently; on ambiguous success → NEEDS_REVIEW.
 * 5. On success: write resultPermitNumber onto JobPermit / Job; status SUCCEEDED.
 * 6. Never auto-retry a step that may have already submitted.
 */
export async function claimNextEpicsSubmitRequest(
  organizationId: string,
): Promise<EpicsSubmitRequestView | null> {
  if (process.env.EPICS_WORKER_ENABLED !== "true") {
    throw new EpicsSeamError(
      "EPICS Playwright worker is disabled in this process (set EPICS_WORKER_ENABLED=true only on the dedicated out-of-band worker). Live city submit never runs inside the Netlify web app.",
      "worker_disabled",
    );
  }

  const next = await db.epicsSubmitRequest.findFirst({
    where: { organizationId, status: EpicsSubmitStatus.QUEUED },
    orderBy: { requestedAt: "asc" },
  });
  if (!next) return null;

  const claimed = await db.epicsSubmitRequest.updateMany({
    where: { id: next.id, status: EpicsSubmitStatus.QUEUED },
    data: { status: EpicsSubmitStatus.RUNNING, claimedAt: new Date() },
  });
  if (claimed.count === 0) return null;

  const row = await db.epicsSubmitRequest.findUniqueOrThrow({ where: { id: next.id } });
  return toView(row);
}

/**
 * Mark a claimed request NEEDS_REVIEW / FAILED / SUCCEEDED from the worker.
 * The web app may also mark NEEDS_REVIEW if staff cancel a stuck RUNNING row —
 * it must never flip QUEUED → SUCCEEDED without the worker.
 */
export async function resolveEpicsSubmitRequest(
  organizationId: string,
  requestId: string,
  input: {
    readonly status: "SUCCEEDED" | "FAILED" | "NEEDS_REVIEW";
    readonly lastError?: string | null;
    readonly resultPermitNumber?: string | null;
    readonly failureScreenshotUrl?: string | null;
  },
): Promise<EpicsSubmitRequestView> {
  const existing = await db.epicsSubmitRequest.findFirst({
    where: { id: requestId, organizationId },
  });
  if (!existing) throw new EpicsSeamError("EPICS submit request not found.", "not_found");

  const row = await db.epicsSubmitRequest.update({
    where: { id: requestId },
    data: {
      status: input.status as EpicsSubmitStatus,
      finishedAt: new Date(),
      lastError: input.lastError ?? null,
      resultPermitNumber: input.resultPermitNumber ?? existing.resultPermitNumber,
      failureScreenshotUrl: input.failureScreenshotUrl ?? existing.failureScreenshotUrl,
    },
  });
  return toView(row);
}
