/**
 * GET /api/staff/quickbooks/callback — this is QBO_REDIRECT_URI: where Intuit sends
 * the browser back after the admin consents on Intuit's own hosted page. No session
 * check here on purpose — the signed `state` param (minted in
 * connection-service.buildConnectUrl, tied to the admin's organizationId) is this
 * route's real authorization, the same way it would be for any OAuth redirect target.
 */

import { completeConnection, InvalidQuickBooksStateError } from "@/lib/quickbooks/connection-service";

function redirectToSettings(request: Request, query: string): Response {
  return Response.redirect(new URL(`/settings/quickbooks?${query}`, request.url));
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const realmId = url.searchParams.get("realmId");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) {
    return redirectToSettings(request, `error=${encodeURIComponent(error)}`);
  }
  if (!code || !realmId || !state) {
    return redirectToSettings(request, "error=missing_params");
  }

  try {
    await completeConnection(state, code, realmId);
  } catch (caught) {
    if (caught instanceof InvalidQuickBooksStateError) {
      return redirectToSettings(request, "error=invalid_state");
    }
    throw caught;
  }

  return redirectToSettings(request, "connected=1");
}
