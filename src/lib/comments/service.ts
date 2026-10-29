/**
 * The unified Comment/Activity layer (CLAUDE.md 2.3): one polymorphic table across
 * every module, keyed by (featureType, featureId), rather than a comment table per
 * module. `featureType` is a plain string, not an enum — a new module never needs
 * a migration just to become commentable.
 */

import { NotificationChannel } from "@/generated/prisma/enums";
import type { Actor } from "@/lib/actor";
import { authorColumns } from "@/lib/actor";
import { db } from "@/lib/db";
import { createNotification } from "@/lib/notifications/service";

export interface CreateCommentInput {
  readonly organizationId: string;
  readonly featureType: string;
  readonly featureId: string;
  /** @deprecated Prefer `actor`. */
  readonly authorUserId?: string | null;
  readonly actor?: Actor;
  readonly body: string;
  readonly mentions?: readonly string[];
}

export async function createComment(input: CreateCommentInput) {
  const authors = input.actor
    ? authorColumns(input.actor)
    : { authorUserId: input.authorUserId ?? null, authorApiKeyId: null };

  const comment = await db.comment.create({
    data: {
      organizationId: input.organizationId,
      featureType: input.featureType,
      featureId: input.featureId,
      authorUserId: authors.authorUserId,
      authorApiKeyId: authors.authorApiKeyId,
      body: input.body,
      mentions: [...(input.mentions ?? [])],
    },
  });

  // Best-effort: a notification failure must never fail the comment itself.
  await Promise.all(
    (input.mentions ?? []).map((mentionedUserId) =>
      createNotification({
        organizationId: input.organizationId,
        userId: mentionedUserId,
        channel: NotificationChannel.IN_APP,
        payload: {
          type: "comment_mention",
          commentId: comment.id,
          featureType: input.featureType,
          featureId: input.featureId,
          authorUserId: authors.authorUserId,
          authorApiKeyId: authors.authorApiKeyId,
          bodyPreview: input.body.slice(0, 280),
        },
      }).catch(() => undefined),
    ),
  );

  return comment;
}

export interface ListCommentsInput {
  readonly organizationId: string;
  readonly featureType: string;
  readonly featureId: string;
}

export async function listComments(input: ListCommentsInput) {
  return db.comment.findMany({
    where: { organizationId: input.organizationId, featureType: input.featureType, featureId: input.featureId },
    orderBy: { createdAt: "asc" },
  });
}
