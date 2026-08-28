"use server";

import { revalidatePath } from "next/cache";

import { RateMode } from "@/generated/prisma/enums";
import { requireAppUser } from "@/lib/auth";
import { createEstimate, JobNotFoundError, UnknownCostCodeError } from "@/lib/estimates/service";
import { parseCostCodeLineItems } from "@/lib/financial/parse-line-items";
import { parsePercentToBasisPoints } from "@/lib/money";

export interface ActionState {
  readonly error?: string;
  readonly ok?: boolean;
}

export async function createEstimateAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireAppUser();

  const jobId = String(formData.get("jobId") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const rateMode = String(formData.get("rateMode") ?? "MARKUP") === "MARGIN" ? RateMode.MARGIN : RateMode.MARKUP;
  const rateRaw = String(formData.get("defaultRate") ?? "0");

  if (!title) return { error: "Title is required." };

  try {
    const defaultRateBasisPoints = parsePercentToBasisPoints(rateRaw || "0");
    const lineItems = parseCostCodeLineItems(formData).map((item) => ({
      costCodeId: item.costCodeId,
      title: item.title,
      quantityMilli: item.quantityMilli,
      unitCostCents: item.unitCostCents,
    }));
    if (lineItems.length === 0) return { error: "Add at least one line item." };

    await createEstimate({
      organizationId: user.organizationId,
      jobId,
      title,
      rateMode,
      defaultRateBasisPoints,
      lineItems,
    });
  } catch (error) {
    if (error instanceof JobNotFoundError) return { error: error.message };
    if (error instanceof UnknownCostCodeError) return { error: error.message };
    if (error instanceof Error && error.message.includes("Cannot parse")) return { error: error.message };
    throw error;
  }

  revalidatePath(`/jobs/${jobId}/estimates`);
  return { ok: true };
}
