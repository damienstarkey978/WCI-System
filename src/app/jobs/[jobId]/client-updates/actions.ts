"use server";

import { revalidatePath } from "next/cache";

import { requireAppUser } from "@/lib/auth";
import { AiNotConfiguredError } from "@/lib/ai/weekly-summary-assistant";
import {
  approveAndEmailWeeklySummary,
  createWeeklySummary,
  JobNotFoundError,
  NoPrimaryClientEmailError,
  SummaryNotFoundError,
  updateWeeklySummary,
} from "@/lib/ai/weekly-summary-service";
import { EmailNotConfiguredError, EmailSendError } from "@/lib/email/send";

export interface ActionState {
  readonly error?: string;
  readonly ok?: boolean;
  readonly emailedTo?: string;
}

function parseHighlights(raw: FormDataEntryValue | null): string[] {
  return String(raw ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

export async function generateWeeklySummaryAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireAppUser();

  const jobId = String(formData.get("jobId") ?? "");

  try {
    await createWeeklySummary({ organizationId: user.organizationId, jobId });
  } catch (error) {
    if (error instanceof JobNotFoundError) return { error: error.message };
    if (error instanceof AiNotConfiguredError) return { error: error.message };
    return { error: error instanceof Error ? error.message : "Could not generate the update." };
  }

  revalidatePath(`/jobs/${jobId}/client-updates`);
  return { ok: true };
}

export async function saveWeeklySummaryAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireAppUser();
  const jobId = String(formData.get("jobId") ?? "");
  const summaryId = String(formData.get("summaryId") ?? "");

  try {
    await updateWeeklySummary({
      organizationId: user.organizationId,
      summaryId,
      headline: String(formData.get("headline") ?? ""),
      body: String(formData.get("body") ?? ""),
      highlights: parseHighlights(formData.get("highlights")),
    });
  } catch (error) {
    if (error instanceof SummaryNotFoundError) return { error: error.message };
    return { error: error instanceof Error ? error.message : "Could not save the update." };
  }

  revalidatePath(`/jobs/${jobId}/client-updates`);
  return { ok: true };
}

export async function approveAndEmailWeeklySummaryAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireAppUser();
  const jobId = String(formData.get("jobId") ?? "");
  const summaryId = String(formData.get("summaryId") ?? "");

  try {
    const updated = await approveAndEmailWeeklySummary({
      organizationId: user.organizationId,
      summaryId,
      headline: String(formData.get("headline") ?? ""),
      body: String(formData.get("body") ?? ""),
      highlights: parseHighlights(formData.get("highlights")),
    });
    revalidatePath(`/jobs/${jobId}/client-updates`);
    return { ok: true, emailedTo: updated.emailedTo ?? undefined };
  } catch (error) {
    if (
      error instanceof SummaryNotFoundError ||
      error instanceof NoPrimaryClientEmailError ||
      error instanceof EmailNotConfiguredError ||
      error instanceof EmailSendError
    ) {
      return { error: error.message };
    }
    return { error: error instanceof Error ? error.message : "Could not email the update." };
  }
}
