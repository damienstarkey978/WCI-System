/**
 * Drives the whole OAuth flow against the real database, the way a connector does:
 * register, authorize, redeem, call, refresh, and every refusal that should happen
 * along the way.
 *
 * The flow is only correct end to end — a PKCE check that passes the wrong verifier,
 * or a code that can be redeemed twice, is invisible in any single function's tests.
 */
import { createHash, randomBytes } from "node:crypto";

import { db } from "@/lib/db";
import {
  OAuthError,
  exchangeAuthorizationCode,
  issueAuthorizationCode,
  refreshAccessToken,
  registerClient,
  authenticateOAuthAccessToken,
  validateAuthorizationRequest,
} from "@/lib/oauth/service";

let failures = 0;
function check(label: string, passed: boolean, detail = "") {
  console.log(`${passed ? "  ok  " : "FAIL  "} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!passed) failures += 1;
}

async function refuses(label: string, run: () => Promise<unknown>, expectedCode: string) {
  try {
    await run();
    check(label, false, "it was allowed");
  } catch (error) {
    const code = error instanceof OAuthError ? error.code : `${(error as Error).name}`;
    check(label, code === expectedCode, `got ${code}, wanted ${expectedCode}`);
  }
}

const REDIRECT = "https://claude.ai/api/mcp/auth_callback";

const org = await db.organization.findFirst({ select: { id: true, name: true } });
const user = await db.user.findFirst({ where: { organizationId: org?.id }, select: { id: true } });
if (!org || !user) throw new Error("Seed an organization and a user first.");

// 1. A client registers itself, unauthenticated, exactly as a connector does.
const registered = await registerClient({
  clientName: "Verification Client",
  redirectUris: [REDIRECT],
  tokenEndpointAuthMethod: "none",
});
check("a client can register itself", registered.clientId.length > 0);
check("a public client gets no secret to leak", registered.clientSecret === null);
check("it is granted only MCP scopes", registered.scopes.every((scope) => !scope.endsWith(":write") || scope === "proposals:write"));

await refuses("an http redirect is refused", () => registerClient({ clientName: "x", redirectUris: ["http://evil.test/cb"] }), "invalid_redirect_uri");
await refuses("a redirect with a fragment is refused", () => registerClient({ clientName: "x", redirectUris: ["https://ok.test/cb#frag"] }), "invalid_redirect_uri");

// 2. PKCE, generated the way a client does.
const verifier = randomBytes(32).toString("base64url");
const challenge = createHash("sha256").update(verifier, "utf8").digest("base64url");

const validated = await validateAuthorizationRequest({
  clientId: registered.clientId,
  redirectUri: REDIRECT,
  scopes: ["proposals:write", "leads:read"],
  codeChallenge: challenge,
  codeChallengeMethod: "S256",
});
check("an authorize request validates", validated.grantedScopes.length === 2);

await refuses(
  "an unregistered redirect is refused",
  () => validateAuthorizationRequest({ clientId: registered.clientId, redirectUri: "https://evil.test/cb", scopes: [], codeChallenge: challenge, codeChallengeMethod: "S256" }),
  "invalid_request",
);
await refuses(
  "plain PKCE is refused — S256 only",
  () => validateAuthorizationRequest({ clientId: registered.clientId, redirectUri: REDIRECT, scopes: [], codeChallenge: challenge, codeChallengeMethod: "plain" }),
  "invalid_request",
);

// 3. The person approves, and a code is issued.
const code = await issueAuthorizationCode({
  oauthClientId: validated.client.id,
  userId: user.id,
  organizationId: org.id,
  scopes: validated.grantedScopes,
  redirectUri: REDIRECT,
  codeChallenge: challenge,
  codeChallengeMethod: "S256",
});

await refuses(
  "the wrong verifier cannot redeem the code",
  () => exchangeAuthorizationCode({ code, clientId: registered.clientId, redirectUri: REDIRECT, codeVerifier: randomBytes(32).toString("base64url") }),
  "invalid_grant",
);
await refuses(
  "a different redirect cannot redeem the code",
  () => exchangeAuthorizationCode({ code, clientId: registered.clientId, redirectUri: "https://evil.test/cb", codeVerifier: verifier }),
  "invalid_grant",
);

// 4. The real redemption.
const tokens = await exchangeAuthorizationCode({ code, clientId: registered.clientId, redirectUri: REDIRECT, codeVerifier: verifier });
check("the code redeems for a token", tokens.accessToken.startsWith("wcia_"));
check("and a refresh token", tokens.refreshToken.startsWith("wcir_"));

await refuses(
  "the code cannot be redeemed twice",
  () => exchangeAuthorizationCode({ code, clientId: registered.clientId, redirectUri: REDIRECT, codeVerifier: verifier }),
  "invalid_grant",
);

// 5. The token identifies a person acting for an organization.
const context = await authenticateOAuthAccessToken(tokens.accessToken);
check("the access token resolves", context !== null);
check("to the right organization", context?.organizationId === org.id);
check("and to the person who approved it", context?.userId === user.id);
check("carrying only the granted scopes", JSON.stringify(context?.scopes.slice().sort()) === JSON.stringify(["leads:read", "proposals:write"]));
check("a made-up token resolves to nothing", (await authenticateOAuthAccessToken("wcia_deadbeef_nope")) === null);

// 6. Refresh, and rotation.
const refreshed = await refreshAccessToken({ refreshToken: tokens.refreshToken, clientId: registered.clientId });
check("refreshing issues a new access token", refreshed.accessToken !== tokens.accessToken);
check("and a new refresh token", refreshed.refreshToken !== tokens.refreshToken);

await refuses(
  "the old refresh token is dead after rotation",
  () => refreshAccessToken({ refreshToken: tokens.refreshToken, clientId: registered.clientId }),
  "invalid_grant",
);
// Replaying a rotated refresh token means someone has a copy, so the whole grant goes.
check(
  "and replaying it kills the grant, not just that call",
  (await authenticateOAuthAccessToken(refreshed.accessToken)) === null,
);

await db.oAuthClient.delete({ where: { id: validated.client.id } });
console.log(failures === 0 ? "\nAll OAuth flow checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
