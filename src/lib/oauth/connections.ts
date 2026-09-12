/**
 * What a person sees and controls after they have connected an assistant.
 *
 * A grant is not a row anywhere — it is a client plus a person, with some number of
 * tokens issued against that pair over time. This collapses those back into the thing
 * someone actually recognises: "Claude, connected by me, last used an hour ago."
 *
 * The consent screen promises this can be undone at any time from Settings. That
 * promise is the reason this exists.
 */

import { db } from "@/lib/db";
import { revokeGrant } from "@/lib/oauth/service";

export interface Connection {
  readonly oauthClientId: string;
  readonly clientName: string;
  readonly clientUri: string | null;
  readonly userId: string;
  readonly userName: string;
  readonly scopes: readonly string[];
  readonly connectedAt: Date;
  /** Null until the assistant has actually called something. */
  readonly lastUsedAt: Date | null;
}

/**
 * Every live connection in an organization, newest first.
 *
 * Built from access tokens rather than refresh tokens because an access token is what
 * carries `lastUsedAt` — "when did this thing last touch our data" is the question
 * someone reviewing this list is really asking.
 */
export async function listConnections(organizationId: string): Promise<Connection[]> {
  const tokens = await db.oAuthAccessToken.findMany({
    where: { organizationId, revokedAt: null, client: { revokedAt: null } },
    select: {
      oauthClientId: true,
      userId: true,
      scopes: true,
      createdAt: true,
      lastUsedAt: true,
      client: { select: { name: true, clientUri: true } },
      user: { select: { name: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  // A refresh rotates the access token, so one connection accumulates rows. The
  // earliest is when the person actually approved it; the latest use across all of
  // them is when it was last active.
  const byGrant = new Map<string, Connection>();
  for (const token of tokens) {
    const key = `${token.oauthClientId}:${token.userId}`;
    const existing = byGrant.get(key);
    const lastUsedAt =
      existing?.lastUsedAt && token.lastUsedAt
        ? new Date(Math.max(existing.lastUsedAt.getTime(), token.lastUsedAt.getTime()))
        : (existing?.lastUsedAt ?? token.lastUsedAt);

    byGrant.set(key, {
      oauthClientId: token.oauthClientId,
      clientName: token.client.name,
      clientUri: token.client.clientUri,
      userId: token.userId,
      userName: token.user.name || token.user.email,
      scopes: token.scopes,
      connectedAt: existing ? (existing.connectedAt < token.createdAt ? existing.connectedAt : token.createdAt) : token.createdAt,
      lastUsedAt,
    });
  }

  return [...byGrant.values()].sort((a, b) => b.connectedAt.getTime() - a.connectedAt.getTime());
}

export class ConnectionNotFoundError extends Error {
  constructor() {
    super("That connection no longer exists.");
    this.name = "ConnectionNotFoundError";
  }
}

/**
 * Cuts a connection off. Every token it holds stops working on the next request —
 * there is no grace period, because the reason someone clicks disconnect is usually
 * that they want it to stop now.
 *
 * Scoped to the organization before anything is revoked: an id from one org must
 * never be able to revoke a grant in another, and the id arrives from a form.
 */
export async function disconnect(organizationId: string, oauthClientId: string, userId: string): Promise<void> {
  const held = await db.oAuthAccessToken.findFirst({
    where: { organizationId, oauthClientId, userId },
    select: { id: true },
  });
  if (!held) throw new ConnectionNotFoundError();

  await revokeGrant(oauthClientId, userId);
}
