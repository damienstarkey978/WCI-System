"use server";

import { redirect } from "next/navigation";

import { currentAppUserOrRedirect } from "@/lib/auth";
import { issueAuthorizationCode, resolveRedirectTarget, validateAuthorizationRequest } from "@/lib/oauth/service";
import type { Scope } from "@/lib/api-scopes";

/**
 * Everything the consent screen was asked for travels through the form rather than a
 * server-side session. The request is re-validated here against the client's own
 * registration before a code is issued, so a tampered hidden field buys nothing: a
 * redirect URI that isn't registered, or a weakened PKCE challenge, is refused at this
 * point exactly as it was when the screen rendered.
 */
export async function approveAuthorization(formData: FormData): Promise<void> {
  const user = await currentAppUserOrRedirect();

  const field = (name: string) => String(formData.get(name) ?? "");
  const clientId = field("client_id");
  const redirectUri = field("redirect_uri");
  const state = field("state");
  const scopes = field("scope").split(/\s+/).filter(Boolean) as Scope[];

  const { client, grantedScopes } = await validateAuthorizationRequest({
    clientId,
    redirectUri,
    scopes,
    codeChallenge: field("code_challenge"),
    codeChallengeMethod: field("code_challenge_method"),
  });

  const code = await issueAuthorizationCode({
    oauthClientId: client.id,
    userId: user.id,
    organizationId: user.organizationId,
    scopes: grantedScopes,
    redirectUri,
    codeChallenge: field("code_challenge"),
    codeChallengeMethod: field("code_challenge_method"),
  });

  const target = new URL(redirectUri);
  target.searchParams.set("code", code);
  if (state) target.searchParams.set("state", state);
  redirect(target.toString());
}

/**
 * A refusal goes back to the client as an error on its own redirect, not as a page
 * here — the client is waiting on that callback and would otherwise hang.
 */
export async function denyAuthorization(formData: FormData): Promise<void> {
  const redirectUri = String(formData.get("redirect_uri") ?? "");
  const state = String(formData.get("state") ?? "");
  const clientId = String(formData.get("client_id") ?? "");

  // Still checked against the registration: an unregistered redirect is not a place to
  // send anything, including an error.
  const client = await resolveRedirectTarget(clientId, redirectUri);
  if (!client) redirect("/dashboard");

  const target = new URL(redirectUri);
  target.searchParams.set("error", "access_denied");
  target.searchParams.set("error_description", "The request was declined.");
  if (state) target.searchParams.set("state", state);
  redirect(target.toString());
}
