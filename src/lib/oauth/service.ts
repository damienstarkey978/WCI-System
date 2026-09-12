/**
 * OAuth 2.1 authorization server, for connecting WCI OS to an outside assistant.
 *
 * The MCP endpoint already accepts an API key (src/lib/api-auth.ts), and that is
 * enough for a locally-configured client. It is not enough for the two connectors
 * this exists for: ChatGPT requires OAuth 2.1 with dynamic client registration and
 * rejects bearer tokens outright, and claude.ai's custom connectors expect the same
 * flow. Neither will talk to a server that only knows shared keys.
 *
 * The other half of the reason is worth stating even though no connector demands it:
 * an API key identifies a key, never a person. A token minted here belongs to whoever
 * approved it, so what an assistant does in WCI OS is attributable to a named user,
 * and removing one person's access is a revocation rather than a key rotation that
 * disturbs everyone.
 *
 * Shape of the flow, all of it standard:
 *   1. The client registers itself         — RFC 7591, registerClient()
 *   2. A person approves it in the browser — /oauth/authorize, issueAuthorizationCode()
 *   3. The client redeems the code         — exchangeAuthorizationCode(), PKCE-verified
 *   4. It refreshes when the token expires — refreshAccessToken(), rotating each time
 *
 * Codes and tokens use the same `<prefix>_<tokenId>_<secret>` shape as API keys, so
 * the id is safe to index and log and only the secret's hash is ever stored.
 */

import { createHash, timingSafeEqual } from "node:crypto";

import { SCOPES, type Scope } from "@/lib/api-scopes";
import { db } from "@/lib/db";
import { generateSecureToken, hashSecret, parseSecureToken, secretMatches } from "@/lib/secure-tokens";

const CODE_PREFIX = "wcic";
const ACCESS_PREFIX = "wcia";
const REFRESH_PREFIX = "wcir";
const CLIENT_SECRET_PREFIX = "wcis";

/** OAuth 2.1 caps an authorization code's life at ten minutes; it is used within seconds. */
const CODE_TTL_MS = 10 * 60 * 1000;
/** Short enough that a leaked token stops working on its own, long enough not to churn. */
export const ACCESS_TOKEN_TTL_SECONDS = 60 * 60;

/**
 * What an outside assistant may be granted. Everything the MCP tools actually use and
 * nothing else — a token minted here cannot reach an endpoint no tool calls, however
 * broadly the client asks.
 */
export const MCP_GRANTABLE_SCOPES: readonly Scope[] = [
  "jobs:read",
  "cost-codes:read",
  "reports:read",
  "leads:read",
  "proposals:read",
  "proposals:write",
];

/**
 * An error with an OAuth error code, which is what the endpoints must return rather
 * than prose — clients branch on these.
 */
export class OAuthError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, description: string, status = 400) {
    super(description);
    this.name = "OAuthError";
    this.code = code;
    this.status = status;
  }
}

// --- Dynamic client registration (RFC 7591) ---------------------------------

export interface RegisterClientInput {
  readonly clientName: string;
  readonly redirectUris: readonly string[];
  readonly tokenEndpointAuthMethod?: string;
  readonly clientUri?: string | null;
  readonly logoUri?: string | null;
  readonly scopes?: readonly string[];
}

export interface RegisteredClient {
  readonly clientId: string;
  /** Null for a public client — it authenticates with PKCE alone and has no secret to keep. */
  readonly clientSecret: string | null;
  readonly clientName: string;
  readonly redirectUris: readonly string[];
  readonly tokenEndpointAuthMethod: string;
  readonly scopes: readonly string[];
  readonly issuedAt: number;
}

/**
 * A redirect URI must be an absolute https URL with no fragment. http is allowed only
 * for loopback, which is how a desktop client receives its callback.
 */
function assertUsableRedirectUri(value: string): void {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new OAuthError("invalid_redirect_uri", `"${value}" is not a valid absolute URL.`);
  }
  if (url.hash) {
    throw new OAuthError("invalid_redirect_uri", "A redirect URI must not contain a fragment.");
  }
  const loopback = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "::1";
  if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) {
    throw new OAuthError("invalid_redirect_uri", "A redirect URI must use https, except on loopback.");
  }
}

export async function registerClient(input: RegisterClientInput): Promise<RegisteredClient> {
  if (input.redirectUris.length === 0) {
    throw new OAuthError("invalid_redirect_uri", "At least one redirect_uri is required.");
  }
  input.redirectUris.forEach(assertUsableRedirectUri);

  const authMethod = input.tokenEndpointAuthMethod ?? "client_secret_post";
  if (authMethod !== "none" && authMethod !== "client_secret_post" && authMethod !== "client_secret_basic") {
    throw new OAuthError("invalid_client_metadata", `Unsupported token_endpoint_auth_method "${authMethod}".`);
  }

  // A client may ask for less than the maximum; anything outside the grantable set is
  // dropped rather than rejected, which is what RFC 7591 expects of a server that
  // narrows a registration request.
  const requested = input.scopes?.length ? input.scopes : MCP_GRANTABLE_SCOPES;
  const scopes = MCP_GRANTABLE_SCOPES.filter((scope) => requested.includes(scope));

  const clientId = `wci-client-${generateSecureToken("x").tokenId}${Date.now().toString(36)}`;
  // A public client has nothing to protect a secret with, so it gets none and relies on
  // PKCE — which is the only thing actually protecting either kind against a stolen code.
  const secret = authMethod === "none" ? null : generateSecureToken(CLIENT_SECRET_PREFIX);

  const client = await db.oAuthClient.create({
    data: {
      organizationId: null,
      name: input.clientName.slice(0, 200),
      clientId,
      hashedClientSecret: secret?.hashedSecret ?? "",
      scopes: scopes as string[],
      redirectUris: [...input.redirectUris],
      tokenEndpointAuthMethod: authMethod,
      selfRegistered: true,
      clientUri: input.clientUri ?? null,
      logoUri: input.logoUri ?? null,
    },
  });

  return {
    clientId: client.clientId,
    clientSecret: secret?.token ?? null,
    clientName: client.name,
    redirectUris: client.redirectUris,
    tokenEndpointAuthMethod: client.tokenEndpointAuthMethod,
    scopes: client.scopes,
    issuedAt: Math.floor(client.createdAt.getTime() / 1000),
  };
}

// --- Authorization ----------------------------------------------------------

export interface AuthorizationRequest {
  readonly clientId: string;
  readonly redirectUri: string;
  readonly scopes: readonly Scope[];
  readonly codeChallenge: string;
  readonly codeChallengeMethod: string;
}

/**
 * Checks an /oauth/authorize request before anything is shown to the person, and
 * returns the client so the consent screen can name it.
 *
 * The redirect URI is matched exactly against the registration. A prefix match is the
 * classic way this goes wrong: it lets a registered client be steered into handing a
 * code to a path its owner never registered.
 */
export async function validateAuthorizationRequest(request: AuthorizationRequest) {
  const client = await db.oAuthClient.findUnique({ where: { clientId: request.clientId } });
  if (!client || client.revokedAt !== null) {
    throw new OAuthError("invalid_client", "Unknown or revoked client_id.", 401);
  }
  if (!client.redirectUris.includes(request.redirectUri)) {
    throw new OAuthError("invalid_request", "redirect_uri does not match this client's registration.");
  }
  // S256 only. "plain" is in the spec for clients that cannot hash, and there are none
  // here — accepting it would mean accepting a challenge that a stolen code defeats.
  if (request.codeChallengeMethod !== "S256") {
    throw new OAuthError("invalid_request", "code_challenge_method must be S256.");
  }
  if (request.codeChallenge.length < 43) {
    throw new OAuthError("invalid_request", "code_challenge is missing or too short.");
  }

  const granted = request.scopes.length > 0
    ? MCP_GRANTABLE_SCOPES.filter((scope) => request.scopes.includes(scope))
    : (client.scopes.filter((scope) => (MCP_GRANTABLE_SCOPES as readonly string[]).includes(scope)) as Scope[]);

  if (granted.length === 0) {
    throw new OAuthError("invalid_scope", "None of the requested scopes can be granted to an MCP client.");
  }

  return { client, grantedScopes: granted };
}

/**
 * Resolves a client and confirms the redirect is one it registered — the minimum
 * needed to know where an answer may be sent. Separate from
 * `validateAuthorizationRequest` because a refusal still has to reach the client's
 * callback, and holding a declined request to the full PKCE checks would strand it
 * waiting on a redirect that never comes.
 */
export async function resolveRedirectTarget(clientId: string, redirectUri: string) {
  const client = await db.oAuthClient.findUnique({ where: { clientId } });
  if (!client || client.revokedAt !== null) return null;
  if (!client.redirectUris.includes(redirectUri)) return null;
  return client;
}

export interface IssueCodeInput {
  readonly oauthClientId: string;
  readonly userId: string;
  readonly organizationId: string;
  readonly scopes: readonly Scope[];
  readonly redirectUri: string;
  readonly codeChallenge: string;
  readonly codeChallengeMethod: string;
}

/** Mints a single-use authorization code for a person who just approved a client. */
export async function issueAuthorizationCode(input: IssueCodeInput): Promise<string> {
  const generated = generateSecureToken(CODE_PREFIX);
  await db.oAuthAuthorizationCode.create({
    data: {
      tokenId: generated.tokenId,
      hashedSecret: generated.hashedSecret,
      oauthClientId: input.oauthClientId,
      userId: input.userId,
      organizationId: input.organizationId,
      scopes: input.scopes as string[],
      redirectUri: input.redirectUri,
      codeChallenge: input.codeChallenge,
      codeChallengeMethod: input.codeChallengeMethod,
      expiresAt: new Date(Date.now() + CODE_TTL_MS),
    },
  });
  return generated.token;
}

// --- Token issuance ---------------------------------------------------------

export interface TokenResponse {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly expiresIn: number;
  readonly scopes: readonly string[];
}

/** Verifies PKCE: the verifier the client kept must hash to the challenge it sent earlier. */
function pkceMatches(verifier: string, challenge: string): boolean {
  const computed = createHash("sha256").update(verifier, "utf8").digest("base64url");
  if (computed.length !== challenge.length) return false;
  return timingSafeEqual(Buffer.from(computed, "utf8"), Buffer.from(challenge, "utf8"));
}

/**
 * Confirms the caller is the client it claims to be. A public client proves nothing
 * here — PKCE is what binds the code to it — so the absence of a secret is expected
 * rather than a failure.
 */
async function authenticateClient(clientId: string, clientSecret: string | null) {
  const client = await db.oAuthClient.findUnique({ where: { clientId } });
  if (!client || client.revokedAt !== null) {
    throw new OAuthError("invalid_client", "Unknown or revoked client_id.", 401);
  }
  if (client.tokenEndpointAuthMethod !== "none") {
    if (!clientSecret) throw new OAuthError("invalid_client", "client_secret is required for this client.", 401);
    const parsed = parseSecureToken(CLIENT_SECRET_PREFIX, clientSecret);
    if (!parsed || !secretMatches(parsed.secret, client.hashedClientSecret)) {
      throw new OAuthError("invalid_client", "client_secret is not valid for this client.", 401);
    }
  }
  return client;
}

async function mintTokens(grant: {
  oauthClientId: string;
  userId: string;
  organizationId: string;
  scopes: string[];
}): Promise<TokenResponse> {
  const access = generateSecureToken(ACCESS_PREFIX);
  const refresh = generateSecureToken(REFRESH_PREFIX);
  const expiresAt = new Date(Date.now() + ACCESS_TOKEN_TTL_SECONDS * 1000);

  await db.$transaction([
    db.oAuthAccessToken.create({
      data: { tokenId: access.tokenId, hashedSecret: access.hashedSecret, expiresAt, ...grant },
    }),
    db.oAuthRefreshToken.create({
      data: { tokenId: refresh.tokenId, hashedSecret: refresh.hashedSecret, ...grant },
    }),
  ]);

  return {
    accessToken: access.token,
    refreshToken: refresh.token,
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    scopes: grant.scopes,
  };
}

export interface ExchangeCodeInput {
  readonly code: string;
  readonly clientId: string;
  readonly clientSecret?: string | null;
  readonly redirectUri: string;
  readonly codeVerifier: string;
}

export async function exchangeAuthorizationCode(input: ExchangeCodeInput): Promise<TokenResponse> {
  const client = await authenticateClient(input.clientId, input.clientSecret ?? null);

  const parsed = parseSecureToken(CODE_PREFIX, input.code);
  if (!parsed) throw new OAuthError("invalid_grant", "Malformed authorization code.");

  const record = await db.oAuthAuthorizationCode.findUnique({ where: { tokenId: parsed.tokenId } });
  if (!record || !secretMatches(parsed.secret, record.hashedSecret)) {
    throw new OAuthError("invalid_grant", "Unknown authorization code.");
  }
  // Single use, and a second attempt is a signal rather than an accident: either the
  // client is retrying a request that already succeeded, or someone else has the code.
  if (record.consumedAt !== null) {
    throw new OAuthError("invalid_grant", "This authorization code has already been used.");
  }
  if (record.expiresAt.getTime() <= Date.now()) {
    throw new OAuthError("invalid_grant", "This authorization code has expired.");
  }
  if (record.oauthClientId !== client.id) {
    throw new OAuthError("invalid_grant", "This authorization code was issued to a different client.");
  }
  if (record.redirectUri !== input.redirectUri) {
    throw new OAuthError("invalid_grant", "redirect_uri does not match the one the code was issued for.");
  }
  if (!pkceMatches(input.codeVerifier, record.codeChallenge)) {
    throw new OAuthError("invalid_grant", "code_verifier does not match the code_challenge.");
  }

  await db.oAuthAuthorizationCode.update({ where: { id: record.id }, data: { consumedAt: new Date() } });

  return mintTokens({
    oauthClientId: record.oauthClientId,
    userId: record.userId,
    organizationId: record.organizationId,
    scopes: record.scopes,
  });
}

export interface RefreshInput {
  readonly refreshToken: string;
  readonly clientId: string;
  readonly clientSecret?: string | null;
}

/**
 * Exchanges a refresh token for a new pair, revoking the old one. Rotation is what
 * makes a stolen refresh token detectable: the legitimate client's next refresh
 * presents a token that is already revoked, which is a signal the grant is compromised.
 */
export async function refreshAccessToken(input: RefreshInput): Promise<TokenResponse> {
  const client = await authenticateClient(input.clientId, input.clientSecret ?? null);

  const parsed = parseSecureToken(REFRESH_PREFIX, input.refreshToken);
  if (!parsed) throw new OAuthError("invalid_grant", "Malformed refresh token.");

  const record = await db.oAuthRefreshToken.findUnique({ where: { tokenId: parsed.tokenId } });
  if (!record || !secretMatches(parsed.secret, record.hashedSecret)) {
    throw new OAuthError("invalid_grant", "Unknown refresh token.");
  }
  if (record.revokedAt !== null) {
    // Already rotated or explicitly revoked. Cut the whole grant rather than just
    // refusing this one call: a replayed refresh token means someone has a copy.
    await revokeGrant(record.oauthClientId, record.userId);
    throw new OAuthError("invalid_grant", "This refresh token is no longer valid. Reconnect to authorize again.");
  }
  if (record.oauthClientId !== client.id) {
    throw new OAuthError("invalid_grant", "This refresh token was issued to a different client.");
  }

  const issued = await mintTokens({
    oauthClientId: record.oauthClientId,
    userId: record.userId,
    organizationId: record.organizationId,
    scopes: record.scopes,
  });

  const replacement = parseSecureToken(REFRESH_PREFIX, issued.refreshToken);
  await db.oAuthRefreshToken.update({
    where: { id: record.id },
    data: { revokedAt: new Date(), rotatedToId: replacement?.tokenId ?? null },
  });

  return issued;
}

/** Revokes every token a client holds for one person — what "disconnect" means. */
export async function revokeGrant(oauthClientId: string, userId: string): Promise<void> {
  const revokedAt = new Date();
  await db.$transaction([
    db.oAuthAccessToken.updateMany({ where: { oauthClientId, userId, revokedAt: null }, data: { revokedAt } }),
    db.oAuthRefreshToken.updateMany({ where: { oauthClientId, userId, revokedAt: null }, data: { revokedAt } }),
  ]);
}

// --- Verifying a token on an MCP request ------------------------------------

export interface OAuthTokenContext {
  readonly accessTokenId: string;
  readonly organizationId: string;
  readonly userId: string;
  readonly clientName: string;
  readonly scopes: readonly string[];
}

/**
 * Resolves an access token to who is calling, or null if it is not ours, not valid, or
 * expired. Null rather than a reason: the MCP endpoint answers every failure with the
 * same 401, and the caller learns nothing from which one it was.
 */
export async function authenticateOAuthAccessToken(token: string): Promise<OAuthTokenContext | null> {
  const parsed = parseSecureToken(ACCESS_PREFIX, token);
  if (!parsed) return null;

  const record = await db.oAuthAccessToken.findUnique({
    where: { tokenId: parsed.tokenId },
    include: { client: { select: { name: true, revokedAt: true } } },
  });
  if (!record || !secretMatches(parsed.secret, record.hashedSecret)) return null;
  if (record.revokedAt !== null || record.client.revokedAt !== null) return null;
  if (record.expiresAt.getTime() <= Date.now()) return null;

  void db.oAuthAccessToken
    .update({ where: { id: record.id }, data: { lastUsedAt: new Date() } })
    .catch(() => undefined);

  return {
    accessTokenId: record.id,
    organizationId: record.organizationId,
    userId: record.userId,
    clientName: record.client.name,
    scopes: record.scopes,
  };
}

/** Every scope this server knows how to name in metadata. */
export function advertisedScopes(): string[] {
  return MCP_GRANTABLE_SCOPES.filter((scope) => (SCOPES as readonly string[]).includes(scope));
}

export { hashSecret };
