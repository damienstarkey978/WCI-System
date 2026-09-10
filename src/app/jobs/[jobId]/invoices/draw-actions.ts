"use server";

import { revalidatePath } from "next/cache";

import { requireAppUser } from "@/lib/auth";
import {
  DrawAlreadyInvoicedError,
  DrawNotFoundError,
  DrawScheduleOverallocatedError,
  JobNotFoundError,
  NoBudgetError,
  createDrawSchedule,
  generateDraftInvoiceForDraw,
} from "@/lib/invoicing/service";
import { parsePercentToBasisPoints } from "@/lib/money";

export interface ActionState {
  readonly error?: string;
  readonly ok?: boolean;
}

/**
 * Build a job's draw schedule from the repeated title/percent rows on the form.
 * The service refuses a schedule totalling over 100% of the contract; that refusal
 * is surfaced here rather than pre-empted, so the office sees the real total.
 */
export async function createDrawScheduleAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireAppUser();
  const jobId = String(formData.get("jobId") ?? "");
  const name = String(formData.get("name") ?? "").trim() || "Draw Schedule";

  const titles = formData.getAll("drawTitle").map(String);
  const percents = formData.getAll("drawPercent").map(String);
  const dates = formData.getAll("drawDate").map(String);

  const draws = titles
    .map((title, index) => ({ title: title.trim(), percent: percents[index] ?? "", date: dates[index] ?? "" }))
    .filter((draw) => draw.title && draw.percent);

  if (draws.length === 0) return { error: "Add at least one draw with a name and a percentage." };

  try {
    await createDrawSchedule({
      organizationId: user.organizationId,
      jobId,
      name,
      draws: draws.map((draw) => ({
        title: draw.title,
        pctOfContractBasisPoints: parsePercentToBasisPoints(draw.percent),
        autoGeneratesInvoiceOnDate: draw.date ? new Date(draw.date) : null,
      })),
    });
  } catch (error) {
    if (error instanceof JobNotFoundError || error instanceof DrawScheduleOverallocatedError) {
      return { error: error.message };
    }
    if (error instanceof Error && error.message.includes("Cannot parse")) return { error: error.message };
    throw error;
  }

  revalidatePath(`/jobs/${jobId}/invoices`);
  return { ok: true };
}

export async function generateDrawInvoiceAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireAppUser();
  const jobId = String(formData.get("jobId") ?? "");
  const drawId = String(formData.get("drawId") ?? "");

  try {
    await generateDraftInvoiceForDraw(user.organizationId, drawId);
  } catch (error) {
    if (
      error instanceof DrawNotFoundError ||
      error instanceof DrawAlreadyInvoicedError ||
      error instanceof NoBudgetError ||
      error instanceof JobNotFoundError
    ) {
      return { error: error.message };
    }
    throw error;
  }

  revalidatePath(`/jobs/${jobId}/invoices`);
  return { ok: true };
}
