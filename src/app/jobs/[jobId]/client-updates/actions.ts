"use server";

import { revalidatePath } from "next/cache";

import { requireAppUser } from "@/lib/auth";
import { AiNotConfiguredError } from "@/lib/ai/weekly-summary-assistant";
import { createWeeklySummary, JobNotFoundError } from "@/lib/ai/weekly-summary-service";

export interface ActionState {
  readonly error?: string;
  readonly ok?: boolean;
}

export async function generateWeeklySummaryAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireAppUser();

  const jobId = String(formData.get("jobId") ?? "");

  try {
    await createWeeklySummary({ organizationId: user.organizationId, jobId });
  } catch (error) {
    if (error instanceof JobNotFoundError) return { error: error.message };
    if (error instanceof AiNotConfiguredError) return { error: error.message };
    throw error;
  }

  revalidatePath(`/jobs/${jobId}/client-updates`);
  return { ok: true };
}
