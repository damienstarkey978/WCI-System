"use server";

import { revalidatePath } from "next/cache";

import { requireAppUser } from "@/lib/auth";
import { createSurvey, issueResponseLink, JobNotFoundError, SurveyNotFoundError } from "@/lib/surveys/service";

export interface ActionState {
  readonly error?: string;
  readonly ok?: boolean;
}

export interface IssueLinkState {
  readonly error?: string;
  readonly token?: string;
}

export async function createSurveyAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireAppUser();

  const jobId = String(formData.get("jobId") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const touchpointRaw = String(formData.get("touchpoint") ?? "POST_COMPLETION");
  const touchpoint =
    touchpointRaw === "PRE_PROJECT" || touchpointRaw === "MID_PROJECT" || touchpointRaw === "POST_COMPLETION"
      ? touchpointRaw
      : "POST_COMPLETION";

  if (!title) return { error: "Title is required." };

  const questions = formData
    .getAll("questionPrompt")
    .map(String)
    .map((prompt) => prompt.trim())
    .filter(Boolean)
    .map((prompt) => ({ prompt }));

  if (questions.length === 0) return { error: "Add at least one question." };

  try {
    await createSurvey({ organizationId: user.organizationId, jobId, title, touchpoint, questions });
  } catch (error) {
    if (error instanceof JobNotFoundError) return { error: error.message };
    throw error;
  }

  revalidatePath(`/jobs/${jobId}/surveys`);
  return { ok: true };
}

export async function issueSurveyResponseLinkAction(_previous: IssueLinkState, formData: FormData): Promise<IssueLinkState> {
  const user = await requireAppUser();

  const jobId = String(formData.get("jobId") ?? "");
  const surveyId = String(formData.get("surveyId") ?? "");
  const recipientName = String(formData.get("recipientName") ?? "").trim();
  const recipientEmail = String(formData.get("recipientEmail") ?? "").trim();

  try {
    const { token } = await issueResponseLink({
      organizationId: user.organizationId,
      surveyId,
      recipientName: recipientName || null,
      recipientEmail: recipientEmail || null,
    });
    revalidatePath(`/jobs/${jobId}/surveys`);
    return { token };
  } catch (error) {
    if (error instanceof SurveyNotFoundError) return { error: error.message };
    throw error;
  }
}
