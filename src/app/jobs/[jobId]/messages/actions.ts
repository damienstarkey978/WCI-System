"use server";

import { revalidatePath } from "next/cache";

import { requireAppUser } from "@/lib/auth";
import { createComment } from "@/lib/comments/service";
import { db } from "@/lib/db";

import { JOB_MESSAGE_FEATURE_TYPE } from "./constants";

export interface ActionState {
  readonly error?: string;
  readonly ok?: boolean;
}

export async function postJobMessageAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireAppUser();

  const jobId = String(formData.get("jobId") ?? "");
  const body = String(formData.get("body") ?? "").trim();

  if (!body) {
    return { error: "Message can't be empty." };
  }

  const job = await db.job.findFirst({ where: { id: jobId, organizationId: user.organizationId } });
  if (!job) {
    return { error: "Job not found." };
  }

  await createComment({
    organizationId: user.organizationId,
    featureType: JOB_MESSAGE_FEATURE_TYPE,
    featureId: job.id,
    authorUserId: user.id,
    body,
  });

  revalidatePath(`/jobs/${jobId}/messages`);
  return { ok: true };
}
