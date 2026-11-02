/**
 * QboSyncLog writer — CLAUDE.md 2.3: "a sync-log table so a failed push is visible and
 * retryable rather than silently dropped." One row per attempt, not per record; sync
 * functions call this in both the success and failure path so every attempt is visible.
 *
 * Money rule 9: optional vendor/number/amount/actor/operation for bill-create audits
 * and daily counts.
 */

import { db } from "@/lib/db";
import type { QboSyncDirection, QboSyncEntityType } from "@/generated/prisma/enums";

export interface RecordSyncAttemptInput {
  readonly organizationId: string;
  readonly entityType: QboSyncEntityType;
  readonly direction: QboSyncDirection;
  readonly wciRecordId: string;
  readonly qboId?: string | null;
  readonly error?: unknown;
  readonly vendorName?: string | null;
  readonly docNumber?: string | null;
  readonly amountCents?: number | null;
  readonly actorLabel?: string | null;
  readonly operation?: string | null;
}

export function recordSyncAttempt(input: RecordSyncAttemptInput): Promise<unknown> {
  return db.qboSyncLog.create({
    data: {
      organizationId: input.organizationId,
      entityType: input.entityType,
      direction: input.direction,
      wciRecordId: input.wciRecordId,
      qboId: input.qboId ?? undefined,
      status: input.error ? "FAILED" : "SUCCESS",
      errorMessage: input.error ? (input.error instanceof Error ? input.error.message : String(input.error)) : undefined,
      vendorName: input.vendorName ?? undefined,
      docNumber: input.docNumber ?? undefined,
      amountCents: input.amountCents ?? undefined,
      actorLabel: input.actorLabel ?? undefined,
      operation: input.operation ?? undefined,
    },
  });
}

/** Daily (or since) count of successful WCI→QBO bill creates for Damien (Money rule 9). */
export async function countSuccessfulBillCreatesToQbo(
  organizationId: string,
  since: Date,
): Promise<{ readonly count: number; readonly amountCents: number }> {
  const rows = await db.qboSyncLog.findMany({
    where: {
      organizationId,
      entityType: "BILL",
      direction: "TO_QBO",
      status: "SUCCESS",
      createdAt: { gte: since },
      OR: [{ operation: "create" }, { operation: null }],
    },
    select: { amountCents: true, operation: true, wciRecordId: true },
  });

  // Prefer explicit create ops; include legacy null-operation SUCCESS TO_QBO BILL rows
  // that look like creates (no amount filter — count distinct wciRecordId for null ops).
  const creates = rows.filter((row) => row.operation === "create" || row.operation == null);
  const seen = new Set<string>();
  let amountCents = 0;
  let count = 0;
  for (const row of creates) {
    if (seen.has(row.wciRecordId)) continue;
    seen.add(row.wciRecordId);
    count += 1;
    amountCents += row.amountCents ?? 0;
  }
  return { count, amountCents };
}
