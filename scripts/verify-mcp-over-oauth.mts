/**
 * The test the unit checks cannot do: register a client, mint a token the way the
 * authorize flow does, and then speak actual MCP over HTTP with it.
 *
 * Every piece of this has been verified in isolation. What that does not tell you is
 * whether a connector can get from "never heard of this server" to "called a tool" —
 * which is the only question that matters, and the one that breaks on a wrong header
 * or a preflight nobody answered.
 */
import { createHash, randomBytes } from "node:crypto";

import { db } from "@/lib/db";
import { issueAuthorizationCode, validateAuthorizationRequest } from "@/lib/oauth/service";

const BASE = process.env.MCP_BASE_URL ?? "http://127.0.0.1:3111";
const REDIRECT = "https://claude.ai/api/mcp/auth_callback";

let failures = 0;
function check(label: string, passed: boolean, detail = "") {
  console.log(`${passed ? "  ok  " : "FAIL  "} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!passed) failures += 1;
}

// --- Discovery, as a client with no prior knowledge does it -------------------

const probe = await fetch(`${BASE}/api/mcp`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ jsonrpc: "2.0", method: "initialize", id: 1 }),
});
check("an unauthenticated call is refused", probe.status === 401);
const challengeHeader = probe.headers.get("www-authenticate") ?? "";
const metadataUrl = /resource_metadata="([^"]+)"/.exec(challengeHeader)?.[1];
check("and points at its resource metadata", Boolean(metadataUrl), challengeHeader);

const resourceMetadata = await fetch(metadataUrl!).then((response) => response.json());
const authServer = resourceMetadata.authorization_servers[0];
const serverMetadata = await fetch(`${authServer}/.well-known/oauth-authorization-server`).then((r) => r.json());
check("which leads to the authorization server", typeof serverMetadata.registration_endpoint === "string");
check("advertising PKCE S256", serverMetadata.code_challenge_methods_supported.includes("S256"));

// --- Preflight, which a browser does before any of the above ------------------

for (const path of ["/api/mcp", "/api/oauth/token", "/api/oauth/register"]) {
  const options = await fetch(`${BASE}${path}`, {
    method: "OPTIONS",
    headers: { origin: "https://claude.ai", "access-control-request-method": "POST", "access-control-request-headers": "authorization,content-type" },
  });
  check(`${path} answers a preflight`, options.status === 204 && options.headers.get("access-control-allow-origin") === "*", `status ${options.status}`);
}
check(
  "and the 401 exposes its challenge header to a browser",
  (probe.headers.get("access-control-expose-headers") ?? "").includes("www-authenticate"),
);

// --- Register and authorize, then redeem over HTTP ----------------------------

const registration = await fetch(serverMetadata.registration_endpoint, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ client_name: "MCP Handshake Test", redirect_uris: [REDIRECT], token_endpoint_auth_method: "none" }),
}).then((response) => response.json());
check("a client can register over HTTP", typeof registration.client_id === "string");

const verifier = randomBytes(32).toString("base64url");
const challenge = createHash("sha256").update(verifier, "utf8").digest("base64url");

// Standing in for the person clicking Connect — everything else is the real path.
const org = await db.organization.findFirst({ select: { id: true } });
const user = await db.user.findFirst({ where: { organizationId: org?.id }, select: { id: true } });
if (!org || !user) throw new Error("Seed an organization and a user first.");

const validated = await validateAuthorizationRequest({
  clientId: registration.client_id,
  redirectUri: REDIRECT,
  scopes: [],
  codeChallenge: challenge,
  codeChallengeMethod: "S256",
});
const code = await issueAuthorizationCode({
  oauthClientId: validated.client.id,
  userId: user.id,
  organizationId: org.id,
  scopes: validated.grantedScopes,
  redirectUri: REDIRECT,
  codeChallenge: challenge,
  codeChallengeMethod: "S256",
});

const tokenResponse = await fetch(serverMetadata.token_endpoint, {
  method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: registration.client_id,
    redirect_uri: REDIRECT,
    code_verifier: verifier,
  }),
});
const tokens = await tokenResponse.json();
check("the token endpoint answers over HTTP", tokenResponse.status === 200 && typeof tokens.access_token === "string");
check("with no-store, so nothing caches a token", (tokenResponse.headers.get("cache-control") ?? "").includes("no-store"));

// The same request, as JSON — some clients send it that way rather than form-encoded.
const jsonCode = await issueAuthorizationCode({
  oauthClientId: validated.client.id,
  userId: user.id,
  organizationId: org.id,
  scopes: validated.grantedScopes,
  redirectUri: REDIRECT,
  codeChallenge: challenge,
  codeChallengeMethod: "S256",
});
const jsonToken = await fetch(serverMetadata.token_endpoint, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    grant_type: "authorization_code",
    code: jsonCode,
    client_id: registration.client_id,
    redirect_uri: REDIRECT,
    code_verifier: verifier,
  }),
});
check("a JSON-bodied token request also works", jsonToken.status === 200);

// --- Speak MCP with the token -------------------------------------------------

async function rpc(method: string, params: unknown, id: number) {
  const response = await fetch(`${BASE}/api/mcp`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      authorization: `Bearer ${tokens.access_token}`,
    },
    body: JSON.stringify({ jsonrpc: "2.0", method, params, id }),
  });
  return { status: response.status, body: await response.json() };
}

const initialized = await rpc("initialize", {
  protocolVersion: "2025-06-18",
  capabilities: {},
  clientInfo: { name: "handshake-test", version: "1.0.0" },
}, 1);
check("initialize succeeds with an OAuth token", initialized.status === 200 && Boolean(initialized.body.result), JSON.stringify(initialized.body).slice(0, 160));
check("and the server names itself", initialized.body.result?.serverInfo?.name === "wci-os");

const listed = await rpc("tools/list", {}, 2);
const toolNames: string[] = (listed.body.result?.tools ?? []).map((tool: { name: string }) => tool.name);
check("tools/list returns the granted tools", toolNames.length > 0, toolNames.join(", "));
check("including proposal drafting", toolNames.includes("create_proposal_for_lead"));
check("and the lead list it needs first", toolNames.includes("list_leads"));
// The token carries only MCP-grantable scopes, so no tool needing anything else can
// appear. Named explicitly rather than asserted as a set difference: what matters is
// that nothing here moves money or reaches a client, and those are the tools to name.
const FORBIDDEN = ["send_proposal", "create_bill", "approve_bill", "record_payment", "send_invoice", "create_purchase_order"];
const leaked = FORBIDDEN.filter((name) => toolNames.includes(name));
check("and no tool that moves money or reaches a client", leaked.length === 0, leaked.join(", "));

const called = await rpc("tools/call", { name: "list_leads", arguments: {} }, 3);
check("a tool actually runs", called.status === 200 && Boolean(called.body.result), JSON.stringify(called.body).slice(0, 200));

// A revoked client must stop working immediately, not at token expiry.
await db.oAuthClient.update({ where: { id: validated.client.id }, data: { revokedAt: new Date() } });
const afterRevoke = await rpc("tools/list", {}, 4);
check("revoking the client locks it out at once", afterRevoke.status === 401);

await db.oAuthClient.delete({ where: { id: validated.client.id } });
console.log(failures === 0 ? "\nMCP over OAuth works end to end." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
