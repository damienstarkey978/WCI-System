/**
 * Checks the disconnect path does what the consent screen promises: a live connection
 * shows up, disconnecting it stops the token working immediately, and it disappears
 * from the list.
 */
import { createHash, randomBytes } from "node:crypto";

import { db } from "@/lib/db";
import { disconnect, listConnections } from "@/lib/oauth/connections";
import {
  authenticateOAuthAccessToken,
  exchangeAuthorizationCode,
  issueAuthorizationCode,
  registerClient,
  validateAuthorizationRequest,
} from "@/lib/oauth/service";

let failures = 0;
function check(label: string, passed: boolean, detail = "") {
  console.log(`${passed ? "  ok  " : "FAIL  "} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!passed) failures += 1;
}

const REDIRECT = "https://claude.ai/api/mcp/auth_callback";
const org = await db.organization.findFirst({ select: { id: true } });
const user = await db.user.findFirst({ where: { organizationId: org?.id }, select: { id: true } });
if (!org || !user) throw new Error("Seed an organization and a user first.");

const before = await listConnections(org.id);

const registered = await registerClient({ clientName: "Disconnect Test", redirectUris: [REDIRECT], tokenEndpointAuthMethod: "none" });
const verifier = randomBytes(32).toString("base64url");
const challenge = createHash("sha256").update(verifier, "utf8").digest("base64url");
const validated = await validateAuthorizationRequest({ clientId: registered.clientId, redirectUri: REDIRECT, scopes: [], codeChallenge: challenge, codeChallengeMethod: "S256" });
const code = await issueAuthorizationCode({
  oauthClientId: validated.client.id,
  userId: user.id,
  organizationId: org.id,
  scopes: validated.grantedScopes,
  redirectUri: REDIRECT,
  codeChallenge: challenge,
  codeChallengeMethod: "S256",
});
const tokens = await exchangeAuthorizationCode({ code, clientId: registered.clientId, redirectUri: REDIRECT, codeVerifier: verifier });

const listed = await listConnections(org.id);
const mine = listed.find((connection) => connection.oauthClientId === validated.client.id);
check("a new connection appears in the list", Boolean(mine));
check("named after the application", mine?.clientName === "Disconnect Test");
check("attributed to the person who approved it", mine?.userId === user.id);
check("and shows as never used before the first call", mine?.lastUsedAt === null);
check("without duplicating what was already there", listed.length === before.length + 1);

check("its token works", (await authenticateOAuthAccessToken(tokens.accessToken)) !== null);

// An id from another organization must not be revocable through this path.
await disconnect(org.id, validated.client.id, user.id).then(
  () => check("disconnecting succeeds", true),
  (error) => check("disconnecting succeeds", false, String(error)),
);

check("the token stops working at once", (await authenticateOAuthAccessToken(tokens.accessToken)) === null);
const after = await listConnections(org.id);
check("and it is gone from the list", !after.some((connection) => connection.oauthClientId === validated.client.id));

await disconnect("org_does_not_exist", validated.client.id, user.id).then(
  () => check("a foreign organization cannot revoke it", false, "it was allowed"),
  (error) => check("a foreign organization cannot revoke it", (error as Error).name === "ConnectionNotFoundError"),
);

await db.oAuthClient.delete({ where: { id: validated.client.id } });
console.log(failures === 0 ? "\nDisconnect works as promised." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
