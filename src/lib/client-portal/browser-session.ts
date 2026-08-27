/**
 * Cookie-backed portal session for the browser UI (src/app/portal). The portal's
 * own auth (./auth.ts) is bearer-token-first, designed for API callers — this
 * adapts it for a browser session by storing the same session token in an
 * httpOnly cookie and replaying it through a synthetic Authorization header, so
 * the token-parsing/validation logic itself is never duplicated.
 */

import { cookies } from "next/headers";

import { authenticateClientSession, type ClientSessionContext } from "./auth";

export const PORTAL_SESSION_COOKIE = "wci_portal_session";

export async function currentPortalSession(): Promise<ClientSessionContext | null> {
  const store = await cookies();
  const token = store.get(PORTAL_SESSION_COOKIE)?.value;
  if (!token) return null;

  const request = new Request("http://portal.internal/", { headers: { authorization: `Bearer ${token}` } });
  const result = await authenticateClientSession(request);
  return result.ok ? result.context : null;
}
