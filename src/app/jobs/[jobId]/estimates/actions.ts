"use server";

import { revalidatePath } from "next/cache";

import { RateMode } from "@/generated/prisma/enums";
import { requireAppUser } from "@/lib/auth";
import { InvalidCsvError, parseEstimateCsv, UnknownCostCodesInCsvError } from "@/lib/estimates/csv-import";
import {
  EmptyEstimateError,
  EstimateAlreadyLockedError,
  EstimateNotFoundError as BudgetEstimateNotFoundError,
  sendEstimateToBudget,
} from "@/lib/budget/send-to-budget";
import {
  addEstimateLineItem,
  createEstimate,
  deleteEstimateLineItem,
  EstimateNotEditableError,
  JobNotFoundError,
  UnknownCostCodeError,
} from "@/lib/estimates/service";
import {
  createEstimateFromTemplate,
  createEstimateTemplateFromEstimate,
  EstimateNotFoundError,
  EstimateTemplateNotFoundError,
} from "@/lib/estimates/templates";
import { parseCostCodeLineItems } from "@/lib/financial/parse-line-items";
import { MoneyError, parseDollarsToCents, parsePercentToBasisPoints } from "@/lib/money";
import { emitEvent } from "@/lib/webhooks";

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

export async function addJobEstimateLineItemAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireAppUser();
  const jobId = String(formData.get("jobId") ?? "");
  const estimateId = String(formData.get("estimateId") ?? "");
  const costCodeId = String(formData.get("costCodeId") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const groupLabel = String(formData.get("groupLabel") ?? "").trim();
  const quantity = Number(String(formData.get("quantity") ?? "1") || "1");

  if (!costCodeId) return { error: "Choose a cost code." };
  if (!title) return { error: "Title is required." };
  if (!Number.isFinite(quantity) || quantity <= 0) return { error: "Quantity must be greater than zero." };

  try {
    await addEstimateLineItem({
      organizationId: user.organizationId,
      estimateId,
      costCodeId,
      title,
      groupLabel: groupLabel || null,
      quantityMilli: Math.round(quantity * 1_000),
      unitCostCents: parseDollarsToCents(String(formData.get("unitCost") ?? "0") || "0"),
      rateBasisPoints: parsePercentToBasisPoints(String(formData.get("ratePercent") ?? "0") || "0"),
    });
  } catch (error) {
    if (error instanceof EstimateNotEditableError || error instanceof UnknownCostCodeError || error instanceof EstimateNotFoundError || error instanceof MoneyError) {
      return { error: error.message };
    }
    throw error;
  }

  revalidatePath(`/jobs/${jobId}/estimates/${estimateId}`);
  revalidatePath(`/jobs/${jobId}/estimates`);
  return { ok: true };
}

export async function deleteJobEstimateLineItemAction(formData: FormData): Promise<void> {
  const user = await requireAppUser();
  const jobId = String(formData.get("jobId") ?? "");
  const estimateId = String(formData.get("estimateId") ?? "");
  const lineItemId = String(formData.get("lineItemId") ?? "");

  try {
    await deleteEstimateLineItem(user.organizationId, estimateId, lineItemId);
  } catch (error) {
    if (!(error instanceof EstimateNotEditableError)) throw error;
  }

  revalidatePath(`/jobs/${jobId}/estimates/${estimateId}`);
  revalidatePath(`/jobs/${jobId}/estimates`);
}

/** The explicit Estimate -> Budget conversion (CLAUDE.md 2.3); same call and webhook as POST /api/v1/estimates/{id}/send-to-budget. */
export async function sendEstimateToBudgetAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireAppUser();
  const jobId = String(formData.get("jobId") ?? "");
  const estimateId = String(formData.get("estimateId") ?? "");

  try {
    const result = await sendEstimateToBudget({ estimateId, organizationId: user.organizationId, allowResend: false });
    await emitEvent(user.organizationId, "estimate.sent_to_budget", {
      estimateId: result.estimateId,
      jobId: result.jobId,
      budgetLinesWritten: result.budgetLinesWritten,
      totalCostCents: result.totalCostCents,
      totalClientPriceCents: result.totalClientPriceCents,
    });
  } catch (error) {
    if (error instanceof EstimateAlreadyLockedError || error instanceof EmptyEstimateError || error instanceof BudgetEstimateNotFoundError) {
      return { error: error.message };
    }
    throw error;
  }

  revalidatePath(`/jobs/${jobId}/estimates/${estimateId}`);
  revalidatePath(`/jobs/${jobId}/estimates`);
  revalidatePath(`/jobs/${jobId}/budget`);
  return { ok: true };
}
