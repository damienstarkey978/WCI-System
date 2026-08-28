"use server";

import { InvalidResponseLinkError, submitResponse } from "@/lib/surveys/service";

export interface ActionState {
  readonly error?: string;
  readonly ok?: boolean;
}

export async function submitSurveyResponseAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const token = String(formData.get("token") ?? "");
  const questionIds = formData.getAll("questionId").map(String);

  const answers: Record<string, string> = {};
  for (const questionId of questionIds) {
    const answer = String(formData.get(`answer_${questionId}`) ?? "").trim();
    if (answer) answers[questionId] = answer;
  }

  try {
    await submitResponse(token, answers);
  } catch (error) {
    if (error instanceof InvalidResponseLinkError) return { error: error.message };
    throw error;
  }

  return { ok: true };
}
