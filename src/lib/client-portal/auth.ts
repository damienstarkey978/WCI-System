/**
 * Client Portal authentication (CLAUDE.md 2.3, Phase 3).
 *
 * Deliberately its own auth path — a Client is never a User, so this shares no
 * code with human staff auth (Clerk) or machine auth (src/lib/api-auth.ts)
 * beyond the token crypto in src/lib/secure-tokens.ts.
 *
 * Two token kinds, both `<prefix>_<tokenId>_<secret>`, DB-backed, hash-only storage:
 *   - ClientSession ("wcicps_..."): a logged-in portal session, exchanged for at
 *     login and revocable.
 *   - ClientActionToken ("wcicpa_..."): single-use, scoped to exactly one
 *     (client, purpose, resourceId). Used for headless actions — approving a
 *     Change Order or Selection via a signed email link, with no login
 *     required (CLAUDE.md 2.3) — and for the portal-login invite link itself
 *     (purpose PORTAL_LOGIN), which exchanges for a ClientSession on first use.
 */

import { ClientActionTokenPurpose } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import { extractToken } from "@/lib/api-auth";
import { generateSecureToken, parseSecureToken, secretMatches } from "@/lib/secure-tokens";
import { emitEvent } from "@/lib/webhooks";

const SESSION_TOKEN_PREFIX = "wcicps";
const ACTION_TOKEN_PREFIX = "wcicpa";

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const LOGIN_INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const APPROVAL_LINK_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days — a Selection/CO can sit unapproved a while

export class ClientNotFoundError extends Error {
  constructor(clientId: string) {
    super(`Client ${clientId} not found`);
    this.name = "ClientNotFoundError";
  }
}

/**
 * Issue a portal login invite for a client (staff/agent-authenticated action —
 * CLAUDE.md 2.3's "invited" state). Returns the raw token exactly once, same
 * convention as ApiKey issuance (src/lib/api-auth.ts) — never recoverable
 * after this call returns.
 */
export async function issuePortalLoginInvite(organizationId: string, clientId: string) {
  const client = await db.client.findFirst({ where: { id: clientId, organizationId } });
  if (!client) throw new ClientNotFoundError(clientId);

  const generated = generateSecureToken(ACTION_TOKEN_PREFIX);
  await db.$transaction([
    db.clientActionToken.create({
      data: {
        organizationId,
        clientId,
        purpose: ClientActionTokenPurpose.PORTAL_LOGIN,
        tokenId: generated.tokenId,
        hashedSecret: generated.hashedSecret,
        expiresAt: new Date(Date.now() + LOGIN_INVITE_TTL_MS),
      },
    }),
    db.client.update({ where: { id: clientId }, data: { invitedAt: client.invitedAt ?? new Date() } }),
  ]);

  await emitEvent(organizationId, "client.invited", { clientId, email: client.email });

  return { token: generated.token };
}

export interface IssueApprovalLinkInput {
  readonly organizationId: string;
  readonly clientId: string;
  readonly purpose: typeof ClientActionTokenPurpose.CHANGE_ORDER_APPROVAL | typeof ClientActionTokenPurpose.SELECTION_APPROVAL;
  readonly resourceId: string;
}

/** Issue a single-use headless approval link scoped to one resource. */
export async function issueApprovalLink(input: IssueApprovalLinkInput) {
  const client = await db.client.findFirst({ where: { id: input.clientId, organizationId: input.organizationId } });
  if (!client) throw new ClientNotFoundError(input.clientId);

  const generated = generateSecureToken(ACTION_TOKEN_PREFIX);
  await db.clientActionToken.create({
    data: {
      organizationId: input.organizationId,
      clientId: input.clientId,
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
 * Redeem a ClientActionToken: validate it, run `apply`, then mark it used.
 *
 * Deliberately not one wrapping transaction — `apply` typically calls a
 * service function (approveChangeOrder, approveSelectionOption) that owns and
 * commits its own transaction, and Prisma's driver-adapter pool does not make
 * nesting a second $transaction inside this one atomic with it anyway. The
 * gap this leaves — the same link redeemed twice concurrently, both passing
 * the usedAt check before either write lands — is closed by the target
 * actions themselves: both approval functions re-check the resource's status
 * inside their own transaction and reject an already-approved one, so a
 * duplicate redemption fails there even if it slips past this check.
 */
export async function redeemActionToken<T>(
  token: string,
  expectedPurpose: (typeof ClientActionTokenPurpose)[keyof typeof ClientActionTokenPurpose],
  expectedResourceId: string | null,
  apply: (clientId: string) => Promise<T>,
): Promise<T> {
  const parsed = parseSecureToken(ACTION_TOKEN_PREFIX, token);
  if (!parsed) throw new InvalidActionTokenError();

  const record = await db.clientActionToken.findUnique({ where: { tokenId: parsed.tokenId } });
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

  const result = await apply(record.clientId);
  await db.clientActionToken.update({ where: { id: record.id }, data: { usedAt: new Date() } });
  return result;
}

export interface ClientSessionContext {
  readonly clientId: string;
  readonly organizationId: string;
}

/**
 * Exchange a PORTAL_LOGIN action token for a ClientSession. Marks the client
 * activated on its first-ever login (CLAUDE.md 2.3's "activated" state) —
 * left untouched on every login after the first.
 */
export async function loginWithToken(token: string): Promise<{ sessionToken: string; client: ClientSessionContext }> {
  return redeemActionToken(token, ClientActionTokenPurpose.PORTAL_LOGIN, null, async (clientId) => {
    const client = await db.client.findUniqueOrThrow({ where: { id: clientId } });
    if (client.activatedAt === null) {
      await db.client.update({ where: { id: clientId }, data: { activatedAt: new Date() } });
    }

    const generated = generateSecureToken(SESSION_TOKEN_PREFIX);
    await db.clientSession.create({
      data: {
        clientId,
        tokenId: generated.tokenId,
        hashedSecret: generated.hashedSecret,
        expiresAt: new Date(Date.now() + SESSION_TTL_MS),
      },
    });

    return { sessionToken: generated.token, client: { clientId, organizationId: client.organizationId } };
  });
}

export type ClientAuthResult =
  | { readonly ok: true; readonly context: ClientSessionContext }
  | { readonly ok: false };

/** Authenticate a portal request's session bearer token. */
export async function authenticateClientSession(request: Request): Promise<ClientAuthResult> {
  const token = extractToken(request);
  if (!token) return { ok: false };

  const parsed = parseSecureToken(SESSION_TOKEN_PREFIX, token);
  if (!parsed) return { ok: false };

  const session = await db.clientSession.findUnique({ where: { tokenId: parsed.tokenId }, include: { client: true } });
  if (!session || !secretMatches(parsed.secret, session.hashedSecret)) return { ok: false };
  if (session.revokedAt !== null || session.expiresAt.getTime() <= Date.now()) return { ok: false };

  void db.clientSession.update({ where: { id: session.id }, data: { lastUsedAt: new Date() } }).catch(() => undefined);

  return { ok: true, context: { clientId: session.clientId, organizationId: session.client.organizationId } };
}

/** The module-visibility toggles on ClientJobAccess (CLAUDE.md 2.4's client Permission Wizard). */
export type ClientJobAccessFlag =
  | "canViewDailyLogs"
  | "canViewSchedule"
  | "canViewDocuments"
  | "canViewBudget"
  | "canViewInvoices"
  | "canMakePayments"
  | "canViewBills"
  | "canViewSelections"
  | "canApproveSelections"
  | "canViewChangeOrders"
  | "canApproveChangeOrders";

export class NoJobAccessError extends Error {
  constructor(jobId: string) {
    super(`No portal access to job ${jobId}.`);
    this.name = "NoJobAccessError";
  }
}

export class ModuleNotVisibleError extends Error {
  constructor(flag: ClientJobAccessFlag) {
    super(`The ${flag} module is not enabled for this client on this job.`);
    this.name = "ModuleNotVisibleError";
  }
}

/**
 * Gate a portal action on both "does this client have any access to this job"
 * (row existence — CLAUDE.md 2.3's "access granted" state) and, for read/write
 * gated by a specific module, that module's toggle. Pass `flag: null` for
 * "list of accessible jobs" style endpoints that only need the row to exist.
 */
export async function requireClientJobAccess(clientId: string, jobId: string, flag: ClientJobAccessFlag | null) {
  const access = await db.clientJobAccess.findUnique({ where: { clientId_jobId: { clientId, jobId } } });
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

/**
 * The one call every per-job portal read/write route needs: authenticate the
 * session, then gate on that job's module toggle. Bundled so a route is one
 * call plus one catch block, not two.
 */
export async function authenticatePortalJobRequest(
  request: Request,
  jobId: string,
  flag: ClientJobAccessFlag | null,
): Promise<ClientSessionContext> {
  const auth = await authenticateClientSession(request);
  if (!auth.ok) throw new PortalUnauthorizedError();
  await requireClientJobAccess(auth.context.clientId, jobId, flag);
  return auth.context;
}

/** Maps the errors above to the right HTTP status — shared by every portal route's catch block. */
export function portalAuthErrorResponse(error: unknown): Response | null {
  if (error instanceof PortalUnauthorizedError) {
    return Response.json(
      { error: { code: "unauthorized", message: error.message } },
      { status: 401, headers: { "WWW-Authenticate": 'Bearer realm="wci-os-portal"' } },
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
