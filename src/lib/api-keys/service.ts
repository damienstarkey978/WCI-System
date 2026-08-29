/**
 * API key lifecycle (create/list/revoke) for /settings/api-keys.
 *
 * Every key issued this way authenticates through the same src/lib/api-auth.ts
 * machinery the internal agent roster (Jarvis/Duke/Heather/Hank/Vince/Neil) already
 * uses — this is the first UI path that lets a human mint one without touching the
 * database directly, which is what makes MCP Connection (an external client like
 * Claude Desktop authenticating as this org) actually usable.
 */

import type { AgentKind } from "@/generated/prisma/enums";
import { generateApiKeyToken } from "@/lib/api-auth";
import { isScope, type Scope } from "@/lib/api-scopes";
import { db } from "@/lib/db";

export class InvalidScopeError extends Error {
  constructor(readonly invalidScopes: readonly string[]) {
    super(`Unknown scope(s): ${invalidScopes.join(", ")}`);
    this.name = "InvalidScopeError";
  }
}

export class ApiKeyNotFoundError extends Error {
  constructor(apiKeyId: string) {
    super(`API key ${apiKeyId} not found`);
    this.name = "ApiKeyNotFoundError";
  }
}

export interface ApiKeySummary {
  readonly id: string;
  readonly name: string;
  readonly agentKind: AgentKind | null;
  readonly tokenId: string;
  readonly scopes: readonly string[];
  readonly lastUsedAt: Date | null;
  readonly expiresAt: Date | null;
  readonly revokedAt: Date | null;
  readonly createdByUserId: string | null;
  readonly createdByName: string | null;
  readonly createdAt: Date;
}

export async function listApiKeys(organizationId: string): Promise<readonly ApiKeySummary[]> {
  const keys = await db.apiKey.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
    include: { createdBy: { select: { name: true } } },
  });
  return keys.map((key) => ({
    id: key.id,
    name: key.name,
    agentKind: key.agentKind,
    tokenId: key.tokenId,
    scopes: key.scopes,
    lastUsedAt: key.lastUsedAt,
    expiresAt: key.expiresAt,
    revokedAt: key.revokedAt,
    createdByUserId: key.createdByUserId,
    createdByName: key.createdBy?.name ?? null,
    createdAt: key.createdAt,
  }));
}

export interface CreateApiKeyInput {
  readonly name: string;
  readonly scopes: readonly string[];
  readonly agentKind?: AgentKind | null;
  readonly expiresAt?: Date | null;
  readonly createdByUserId: string;
}

export interface CreatedApiKey {
  readonly summary: ApiKeySummary;
  /** The full bearer token — returned only here, at creation. Never recoverable afterwards. */
  readonly token: string;
}

/** Mints a new key. The plaintext token is returned once and is not stored. */
export async function createApiKey(organizationId: string, input: CreateApiKeyInput): Promise<CreatedApiKey> {
  const name = input.name.trim();
  if (!name) throw new Error("Name is required.");

  const invalidScopes = input.scopes.filter((scope) => !isScope(scope));
  if (invalidScopes.length > 0) throw new InvalidScopeError(invalidScopes);
  const scopes = input.scopes as Scope[];
  if (scopes.length === 0) throw new Error("At least one scope is required.");

  const { token, tokenId, hashedSecret } = generateApiKeyToken();

  const key = await db.apiKey.create({
    data: {
      organizationId,
      name,
      agentKind: input.agentKind ?? null,
      tokenId,
      hashedSecret,
      scopes,
      expiresAt: input.expiresAt ?? null,
      createdByUserId: input.createdByUserId,
    },
    include: { createdBy: { select: { name: true } } },
  });

  return {
    token,
    summary: {
      id: key.id,
      name: key.name,
      agentKind: key.agentKind,
      tokenId: key.tokenId,
      scopes: key.scopes,
      lastUsedAt: key.lastUsedAt,
      expiresAt: key.expiresAt,
      revokedAt: key.revokedAt,
      createdByUserId: key.createdByUserId,
      createdByName: key.createdBy?.name ?? null,
      createdAt: key.createdAt,
    },
  };
}

/** Revocation is permanent and immediate — there is no un-revoke, matching how a leaked token must be handled. */
export async function revokeApiKey(organizationId: string, apiKeyId: string): Promise<void> {
  const key = await db.apiKey.findUnique({ where: { id: apiKeyId } });
  if (!key || key.organizationId !== organizationId) throw new ApiKeyNotFoundError(apiKeyId);
  if (key.revokedAt !== null) return;
  await db.apiKey.update({ where: { id: apiKeyId }, data: { revokedAt: new Date() } });
}
