"use server";

import { revalidatePath } from "next/cache";

import { requireAppUser } from "@/lib/auth";
import {
  EstimateJobMismatchError,
  EstimateNotFoundError,
  generateSpecificationFromEstimate,
  JobNotFoundError,
} from "@/lib/specifications/service";

export interface ActionState {
  readonly error?: string;
  readonly ok?: boolean;
}

export async function generateSpecFromEstimateAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireAppUser();

  const jobId = String(formData.get("jobId") ?? "");
  const estimateId = String(formData.get("estimateId") ?? "");
  const title = String(formData.get("title") ?? "").trim();

  if (!estimateId) return { error: "Choose an estimate." };
  if (!title) return { error: "Title is required." };

  try {
    await generateSpecificationFromEstimate(user.organizationId, jobId, estimateId, title);
  } catch (error) {
    if (error instanceof JobNotFoundError || error instanceof EstimateNotFoundError || error instanceof EstimateJobMismatchError) {
      return { error: error.message };
    }
    throw error;
  }

  revalidatePath(`/jobs/${jobId}/plans-and-specs`);
  return { ok: true };
}
