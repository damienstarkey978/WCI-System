/**
 * Mutation attribution — who changed something, and through which channel.
 *
 * Machine API keys and human browser sessions never share an auth path
 * (src/lib/api-auth.ts). Persist that distinction with dual nullable FKs
 * (actorUserId XOR actorApiKeyId), matching JobStatusEvent / PurchaseOrderEvent.
 * Never collapse both into one generic "actor id."
 */

import type { AgentKind, UserRole } from "@/generated/prisma/enums";

/** Who made a change: a signed-in human, or an agent's API key. Never both. */
export type Actor =
  | { readonly kind: "user"; readonly userId: string; readonly role: UserRole }
  | { readonly kind: "apiKey"; readonly apiKeyId: string };

/** Channel staff should see next to a name — API/bot vs browser/staff UI. */
export type ActorChannel = "api" | "browser" | "system" | "external";

export interface ActorColumns {
  readonly actorUserId: string | null;
  readonly actorApiKeyId: string | null;
}

/** Map an Actor discriminant onto the dual-FK columns used by event tables. */
export function actorColumns(actor?: Actor | null): ActorColumns {
  if (!actor) return { actorUserId: null, actorApiKeyId: null };
  if (actor.kind === "user") return { actorUserId: actor.userId, actorApiKeyId: null };
  return { actorUserId: null, actorApiKeyId: actor.apiKeyId };
}

/** PurchaseOrderEvent / similar tables use actorUserId + actorApiKeyId flat fields. */
export function toPurchaseOrderActor(actor?: Actor | null): ActorColumns {
  return actorColumns(actor);
}

export function actorFromApiKey(apiKeyId: string): Actor {
  return { kind: "apiKey", apiKeyId };
}

export function actorFromUser(userId: string, role: UserRole): Actor {
  return { kind: "user", userId, role };
}

export interface ActorDisplayInput {
  readonly user?: { readonly name?: string | null; readonly email?: string | null } | null;
  readonly apiKey?: { readonly name?: string | null; readonly agentKind?: AgentKind | null } | null;
  /** Optional note when both FKs are null (e.g. client e-sign, vendor portal). */
  readonly externalLabel?: string | null;
}

export interface ActorDisplay {
  /** Human-readable who — User name/email, ApiKey name (heather), or fallback. */
  readonly label: string;
  readonly channel: ActorChannel;
  /** Short badge text for UI: "API", "Browser", "System", "External". */
  readonly channelLabel: string;
  /** Combined line for compact timelines: "Heather · API" / "Damien · Browser". */
  readonly summary: string;
}

/**
 * Resolve stored dual-FK actors into a staff-facing label + channel.
 * Prefers ApiKey when present (API write), else User (browser), else external/system.
 */
export function formatActorAttribution(input: ActorDisplayInput): ActorDisplay {
  if (input.apiKey) {
    const label = input.apiKey.name?.trim() || input.apiKey.agentKind || "API key";
    return { label, channel: "api", channelLabel: "API", summary: `${label} · API` };
  }
  if (input.user) {
    const label = input.user.name?.trim() || input.user.email?.trim() || "Staff user";
    return { label, channel: "browser", channelLabel: "Browser", summary: `${label} · Browser` };
  }
  if (input.externalLabel?.trim()) {
    const label = input.externalLabel.trim();
    return { label, channel: "external", channelLabel: "External", summary: `${label} · External` };
  }
  return { label: "System", channel: "system", channelLabel: "System", summary: "System" };
}

/** Creator-style dual FKs (createdByUserId / createdByApiKeyId). */
export function creatorColumns(actor?: Actor | null): {
  readonly createdByUserId: string | null;
  readonly createdByApiKeyId: string | null;
} {
  const cols = actorColumns(actor);
  return { createdByUserId: cols.actorUserId, createdByApiKeyId: cols.actorApiKeyId };
}

/** Author-style dual FKs (authorUserId / authorApiKeyId). */
export function authorColumns(actor?: Actor | null): {
  readonly authorUserId: string | null;
  readonly authorApiKeyId: string | null;
} {
  const cols = actorColumns(actor);
  return { authorUserId: cols.actorUserId, authorApiKeyId: cols.actorApiKeyId };
}

/** Uploader-style dual FKs (uploadedByUserId / uploadedByApiKeyId). */
export function uploaderColumns(actor?: Actor | null): {
  readonly uploadedByUserId: string | null;
  readonly uploadedByApiKeyId: string | null;
} {
  const cols = actorColumns(actor);
  return { uploadedByUserId: cols.actorUserId, uploadedByApiKeyId: cols.actorApiKeyId };
}
