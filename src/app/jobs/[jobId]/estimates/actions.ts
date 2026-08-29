"use server";

import { revalidatePath } from "next/cache";

import { RateMode } from "@/generated/prisma/enums";
import { requireAppUser } from "@/lib/auth";
import { InvalidCsvError, parseEstimateCsv, UnknownCostCodesInCsvError } from "@/lib/estimates/csv-import";
import { createEstimate, JobNotFoundError, UnknownCostCodeError } from "@/lib/estimates/service";
import {
  createEstimateFromTemplate,
  createEstimateTemplateFromEstimate,
  EstimateNotFoundError,
  EstimateTemplateNotFoundError,
} from "@/lib/estimates/templates";
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

export async function createEstimateFromCsvAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireAppUser();

  const jobId = String(formData.get("jobId") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const rateMode = String(formData.get("rateMode") ?? "MARKUP") === "MARGIN" ? RateMode.MARGIN : RateMode.MARKUP;
  const rateRaw = String(formData.get("defaultRate") ?? "0");
  const csvFile = formData.get("csvFile");

  if (!title) return { error: "Title is required." };
  if (!(csvFile instanceof File) || csvFile.size === 0) return { error: "Choose a CSV file." };

  try {
    const csvText = await csvFile.text();
    const defaultRateBasisPoints = parsePercentToBasisPoints(rateRaw || "0");
    const lineItems = await parseEstimateCsv(user.organizationId, csvText);

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
    if (error instanceof InvalidCsvError) return { error: error.message };
    if (error instanceof UnknownCostCodesInCsvError) return { error: error.message };
    if (error instanceof Error && error.message.includes("Cannot parse")) return { error: error.message };
    throw error;
  }

  revalidatePath(`/jobs/${jobId}/estimates`);
  return { ok: true };
}

export async function saveEstimateAsTemplateAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireAppUser();

  const jobId = String(formData.get("jobId") ?? "");
  const estimateId = String(formData.get("estimateId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Template name is required." };

  try {
    await createEstimateTemplateFromEstimate(user.organizationId, estimateId, name);
  } catch (error) {
    if (error instanceof EstimateNotFoundError) return { error: error.message };
    throw error;
  }

  revalidatePath(`/jobs/${jobId}/estimates`);
  return { ok: true };
}

export async function createEstimateFromTemplateAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireAppUser();

  const jobId = String(formData.get("jobId") ?? "");
  const templateId = String(formData.get("templateId") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  if (!templateId) return { error: "Choose a template." };
  if (!title) return { error: "Title is required." };

  try {
    await createEstimateFromTemplate(user.organizationId, jobId, templateId, title);
  } catch (error) {
    if (error instanceof JobNotFoundError || error instanceof EstimateTemplateNotFoundError) return { error: error.message };
    throw error;
  }

  revalidatePath(`/jobs/${jobId}/estimates`);
  return { ok: true };
}
