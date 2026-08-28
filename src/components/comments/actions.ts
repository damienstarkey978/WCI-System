"use server";

import { revalidatePath } from "next/cache";

import { requireAppUser } from "@/lib/auth";
import { createComment } from "@/lib/comments/service";

export interface ActionState {
  readonly error?: string;
  readonly ok?: boolean;
}

/**
 * One shared Server Action for every CommentThread instance (CLAUDE.md 2.3's
 * unified Comment/Activity layer) — the thread posts featureType/featureId/
 * revalidatePath as hidden fields, so no per-module action file is needed to
 * wire a new detail page onto comments.
 */
export async function postCommentAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireAppUser();

  const featureType = String(formData.get("featureType") ?? "");
  const featureId = String(formData.get("featureId") ?? "");
  const revalidate = String(formData.get("revalidate") ?? "");
  const body = String(formData.get("body") ?? "").trim();

  if (!featureType || !featureId) return { error: "Missing comment target." };
  if (!body) return { error: "Comment can't be empty." };

  await createComment({
    organizationId: user.organizationId,
    featureType,
    featureId,
    authorUserId: user.id,
    body,
  });

  if (revalidate) revalidatePath(revalidate);
  return { ok: true };
}
