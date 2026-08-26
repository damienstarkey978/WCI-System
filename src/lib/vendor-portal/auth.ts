/**
 * Vendor Portal authentication (CLAUDE.md 2.3, Phase 4).
 *
 * Mirrors src/lib/client-portal/auth.ts exactly — a Vendor is never a User,
 * so this shares no code with human staff auth (Clerk) or machine auth
 * (src/lib/api-auth.ts) beyond the token crypto in src/lib/secure-tokens.ts.
 * Kept as a fully separate module rather than parameterizing the Client
 * version: Vendor and Client are different domain concepts with different
 * job-access shapes (VendorJobAccess has no canApprove* flags — a vendor
 * accepts a PO, it doesn't "approve" anything the way a client approves a
 * Change Order) even though the auth mechanics are identical.
 *
 * Two token kinds, both `<prefix>_<tokenId>_<secret>`, DB-backed, hash-only storage:
 *   - VendorSession ("wcivps_..."): a logged-in portal session.
 *   - VendorActionToken ("wcivpa_..."): single-use, scoped to exactly one
 *     (vendor, purpose, resourceId) — the portal-login invite itself
 *     (purpose PORTAL_LOGIN), or a headless PO acceptance link
 *     (purpose PO_ACCEPTANCE) so a vendor can e-sign a PO from an emailed
 *     link with no login required.
 */

import { VendorActionTokenPurpose } from "@/generated/prisma/enums";
import { extractToken } from "@/lib/api-auth";
import { db } from "@/lib/db";
import { generateSecureToken, parseSecureToken, secretMatches } from "@/lib/secure-tokens";
import { emitEvent } from "@/lib/webhooks";

const SESSION_TOKEN_PREFIX = "wcivps";
const ACTION_TOKEN_PREFIX = "wcivpa";

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const LOGIN_INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const APPROVAL_LINK_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export class VendorNotFoundError extends Error {
  constructor(vendorId: string) {
    super(`Vendor ${vendorId} not found`);
    this.name = "VendorNotFoundError";
  }
}

/**
 * Issue a portal login invite for a vendor (staff/agent-authenticated action —
 * CLAUDE.md 2.3's "invited" state). Returns the raw token exactly once, same
 * convention as ApiKey/Client-portal issuance — never recoverable after.
 */
export async function issuePortalLoginInvite(organizationId: string, vendorId: string) {
  const vendor = await db.vendor.findFirst({ where: { id: vendorId, organizationId } });
  if (!vendor) throw new VendorNotFoundError(vendorId);

  const generated = generateSecureToken(ACTION_TOKEN_PREFIX);
  await db.$transaction([
    db.vendorActionToken.create({
      data: {
        organizationId,
        vendorId,
        purpose: VendorActionTokenPurpose.PORTAL_LOGIN,
        tokenId: generated.tokenId,
        hashedSecret: generated.hashedSecret,
        expiresAt: new Date(Date.now() + LOGIN_INVITE_TTL_MS),
      },
    }),
    db.vendor.update({ where: { id: vendorId }, data: { invitedAt: vendor.invitedAt ?? new Date() } }),
  ]);

  await emitEvent(organizationId, "vendor.invited", { vendorId, email: vendor.email });

  return { token: generated.token };
}

export interface IssueApprovalLinkInput {
  readonly organizationId: string;
  readonly vendorId: string;
  readonly purpose: typeof VendorActionTokenPurpose.PO_ACCEPTANCE | typeof VendorActionTokenPurpose.WARRANTY_TRADE_ACCEPTANCE;
  readonly resourceId: string;
}

/** Issue a single-use headless approval link scoped to one resource (a PO). */
export async function issueApprovalLink(input: IssueApprovalLinkInput) {
  const vendor = await db.vendor.findFirst({ where: { id: input.vendorId, organizationId: input.organizationId } });
  if (!vendor) throw new VendorNotFoundError(input.vendorId);

  const generated = generateSecureToken(ACTION_TOKEN_PREFIX);
  await db.vendorActionToken.create({
    data: {
      organizationId: input.organizationId,
      vendorId: input.vendorId,
      purpose: input.purpose,
      resourceId: input.resourceId,
      tokenId: generated.tokenId,
      hashedSecret: generated.hashedSecret,
      expiresAt: new Date(Date.now() + APPROVAL_LINK_TTL_MS),
    },
  });

  return { token: generated.token };
}

export class InvalidActionTokenError extends Error {
  constructor() {
    super("This link is invalid, expired, or has already been used.");
    this.name = "InvalidActionTokenError";
  }
}

/**
 * Redeem a VendorActionToken: validate it, run `apply`, then mark it used.
 * See the identical function in src/lib/client-portal/auth.ts for why this is
 * deliberately not one wrapping transaction.
 */
export async function redeemActionToken<T>(
  token: string,
  expectedPurpose: (typeof VendorActionTokenPurpose)[keyof typeof VendorActionTokenPurpose],
  expectedResourceId: string | null,
  apply: (vendorId: string) => Promise<T>,
): Promise<T> {
  const parsed = parseSecureToken(ACTION_TOKEN_PREFIX, token);
  if (!parsed) throw new InvalidActionTokenError();

  const record = await db.vendorActionToken.findUnique({ where: { tokenId: parsed.tokenId } });
  if (
    !record ||
    !secretMatches(parsed.secret, record.hashedSecret) ||
    record.purpose !== expectedPurpose ||
    record.resourceId !== expectedResourceId ||
    record.usedAt !== null ||
    record.expiresAt.getTime() <= Date.now()
  ) {
    throw new InvalidActionTokenError();
  }

  const result = await apply(record.vendorId);
  await db.vendorActionToken.update({ where: { id: record.id }, data: { usedAt: new Date() } });
  return result;
}

export interface VendorSessionContext {
  readonly vendorId: string;
  readonly organizationId: string;
}

/**
 * Exchange a PORTAL_LOGIN action token for a VendorSession. Marks the vendor
 * activated on its first-ever login.
 */
export async function loginWithToken(token: string): Promise<{ sessionToken: string; vendor: VendorSessionContext }> {
  return redeemActionToken(token, VendorActionTokenPurpose.PORTAL_LOGIN, null, async (vendorId) => {
    const vendor = await db.vendor.findUniqueOrThrow({ where: { id: vendorId } });
    if (vendor.activatedAt === null) {
      await db.vendor.update({ where: { id: vendorId }, data: { activatedAt: new Date() } });
    }

    const generated = generateSecureToken(SESSION_TOKEN_PREFIX);
    await db.vendorSession.create({
      data: {
        vendorId,
        tokenId: generated.tokenId,
        hashedSecret: generated.hashedSecret,
        expiresAt: new Date(Date.now() + SESSION_TTL_MS),
      },
    });

    return { sessionToken: generated.token, vendor: { vendorId, organizationId: vendor.organizationId } };
  });
}

export type VendorAuthResult = { readonly ok: true; readonly context: VendorSessionContext } | { readonly ok: false };

/** Authenticate a portal request's session bearer token. */
export async function authenticateVendorSession(request: Request): Promise<VendorAuthResult> {
  const token = extractToken(request);
  if (!token) return { ok: false };

  const parsed = parseSecureToken(SESSION_TOKEN_PREFIX, token);
  if (!parsed) return { ok: false };

  const session = await db.vendorSession.findUnique({ where: { tokenId: parsed.tokenId }, include: { vendor: true } });
  if (!session || !secretMatches(parsed.secret, session.hashedSecret)) return { ok: false };
  if (session.revokedAt !== null || session.expiresAt.getTime() <= Date.now()) return { ok: false };

  void db.vendorSession.update({ where: { id: session.id }, data: { lastUsedAt: new Date() } }).catch(() => undefined);

  return { ok: true, context: { vendorId: session.vendorId, organizationId: session.vendor.organizationId } };
}

/** The module-visibility toggles on VendorJobAccess (CLAUDE.md 2.4's vendor Permission Wizard). */
export type VendorJobAccessFlag = "canViewDocuments" | "canViewPurchaseOrders" | "canViewBills";

export class NoJobAccessError extends Error {
  constructor(jobId: string) {
    super(`No portal access to job ${jobId}.`);
    this.name = "NoJobAccessError";
  }
}

export class ModuleNotVisibleError extends Error {
  constructor(flag: VendorJobAccessFlag) {
    super(`The ${flag} module is not enabled for this vendor on this job.`);
    this.name = "ModuleNotVisibleError";
  }
}

/**
 * Gate a portal action on both "does this vendor have any access to this job"
 * (row existence — CLAUDE.md 2.3's "access granted" state) and, when given, a
 * specific module's toggle. Pass `flag: null` for "list of accessible jobs"
 * style endpoints that only need the row to exist.
 */
export async function requireVendorJobAccess(vendorId: string, jobId: string, flag: VendorJobAccessFlag | null) {
  const access = await db.vendorJobAccess.findUnique({ where: { vendorId_jobId: { vendorId, jobId } } });
  if (!access) throw new NoJobAccessError(jobId);
  if (flag !== null && !access[flag]) throw new ModuleNotVisibleError(flag);
  return access;
}

export class PortalUnauthorizedError extends Error {
  constructor() {
    super("A valid portal session is required.");
    this.name = "PortalUnauthorizedError";
  }
}

/** The one call every per-job portal read/write route needs. */
export async function authenticatePortalJobRequest(
  request: Request,
  jobId: string,
  flag: VendorJobAccessFlag | null,
): Promise<VendorSessionContext> {
  const auth = await authenticateVendorSession(request);
  if (!auth.ok) throw new PortalUnauthorizedError();
  await requireVendorJobAccess(auth.context.vendorId, jobId, flag);
  return auth.context;
}

/** Maps the errors above to the right HTTP status — shared by every portal route's catch block. */
export function portalAuthErrorResponse(error: unknown): Response | null {
  if (error instanceof PortalUnauthorizedError) {
    return Response.json(
      { error: { code: "unauthorized", message: error.message } },
      { status: 401, headers: { "WWW-Authenticate": 'Bearer realm="wci-os-vendor-portal"' } },
    );
  }
  if (error instanceof NoJobAccessError) {
    return Response.json({ error: { code: "not_found", message: error.message } }, { status: 404 });
  }
  if (error instanceof ModuleNotVisibleError) {
    return Response.json({ error: { code: "forbidden", message: error.message } }, { status: 403 });
  }
  return null;
}
