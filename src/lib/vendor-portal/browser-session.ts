/**
 * Cookie-backed vendor portal session for the browser UI (src/app/vendor-portal) —
 * the same adapter the client portal uses (src/lib/client-portal/browser-session.ts):
 * the bearer-token auth in ./auth.ts stays the single source of truth, and this just
 * replays the session token from an httpOnly cookie through a synthetic Authorization
 * header so none of the token validation is duplicated.
 */

import { cookies } from "next/headers";

import { authenticateVendorSession, type VendorSessionContext } from "./auth";

export const VENDOR_PORTAL_SESSION_COOKIE = "wci_vendor_session";

export async function currentVendorPortalSession(): Promise<VendorSessionContext | null> {
  const store = await cookies();
  const token = store.get(VENDOR_PORTAL_SESSION_COOKIE)?.value;
  if (!token) return null;

  const request = new Request("http://vendor-portal.internal/", { headers: { authorization: `Bearer ${token}` } });
  const result = await authenticateVendorSession(request);
  return result.ok ? result.context : null;
}
