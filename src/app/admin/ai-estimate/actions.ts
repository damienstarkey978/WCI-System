"use server";

import { revalidatePath } from "next/cache";

import { AiNotConfiguredError, DraftGenerationError } from "@/lib/ai/estimate-assistant";
import { createAiEstimateDraft, JobNotFoundError, NoCostCodesError } from "@/lib/ai/service";
import { requireAppUser } from "@/lib/auth";

export interface ActionState {
  readonly error?: string;
  readonly result?: {
    readonly estimateId: string;
    readonly title: string;
    readonly assumptions: readonly string[];
    readonly lineItemCount: number;
  };
}

export async function generateAiEstimateDraftAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireAppUser();

  const jobId = String(formData.get("jobId") ?? "");
  const notes = String(formData.get("notes") ?? "").trim();

  if (!jobId) {
    return { error: "Choose a job." };
  }
  if (notes.length < 10) {
    return { error: "Add a bit more detail to the field notes (at least 10 characters)." };
  }

  try {
    const result = await createAiEstimateDraft({ organizationId: user.organizationId, jobId, notes });
    revalidatePath("/admin/ai-estimate");
    return { result };
  } catch (error) {
    if (error instanceof AiNotConfiguredError) {
      return { error: "AI estimating isn't configured yet — set ANTHROPIC_API_KEY in .env." };
    }
    if (error instanceof JobNotFoundError || error instanceof NoCostCodesError || error instanceof DraftGenerationError) {
      return { error: error.message };
    }
    throw error;
  }
}
