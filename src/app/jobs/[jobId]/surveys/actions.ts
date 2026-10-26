"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

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
  const releaseRaw = String(formData.get("releaseAt") ?? "");
  const clientId = String(formData.get("clientId") ?? "").trim();

  if (!title) return { error: "Survey name is required." };

  const questions = formData
    .getAll("questionPrompt")
    .map(String)
    .map((prompt) => prompt.trim())
    .filter(Boolean)
    .map((prompt) => ({ prompt }));

  if (questions.length === 0) return { error: "Add at least one question." };

  try {
    const survey = await createSurvey({
      organizationId: user.organizationId,
      jobId,
      title,
      touchpoint,
      questions,
      invitationBody: String(formData.get("invitationBody") ?? "").trim() || null,
      releaseAt: releaseRaw ? new Date(releaseRaw) : null,
      clientId: clientId || null,
    });
    revalidatePath(`/jobs/${jobId}/surveys`);
    redirect(`/jobs/${jobId}/surveys?tab=individual&highlight=${survey.id}`);
  } catch (error) {
    if (error instanceof JobNotFoundError) return { error: error.message };
    if (error instanceof Error && error.message.startsWith("Client ")) return { error: error.message };
    throw error;
  }
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
