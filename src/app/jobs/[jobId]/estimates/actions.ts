"use server";

import { revalidatePath } from "next/cache";

import { AiNotConfiguredError, DraftGenerationError, type DraftEstimateImageInput } from "@/lib/ai/estimate-assistant";
import { createAiEstimateDraft, JobNotFoundError as AiJobNotFoundError, NoCostCodesError } from "@/lib/ai/service";
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

const ACCEPTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

async function filesToImageInputs(formData: FormData, field: string): Promise<DraftEstimateImageInput[]> {
  const files = formData.getAll(field).filter((value): value is File => value instanceof File && value.size > 0);
  const images: DraftEstimateImageInput[] = [];
  for (const file of files) {
    if (!ACCEPTED_IMAGE_TYPES.has(file.type)) continue;
    const buffer = Buffer.from(await file.arrayBuffer());
    images.push({ base64Data: buffer.toString("base64"), mediaType: file.type as DraftEstimateImageInput["mediaType"] });
  }
  return images;
}

export interface DraftEstimateActionState {
  readonly error?: string;
  readonly result?: {
    readonly title: string;
    readonly lineItemCount: number;
    readonly assumptions: readonly string[];
  };
}

/**
 * "Draft with AI" (handoff-ai-analysis-and-jarvis-deep-integration-spec.md Part
 * 3.3b) — the same createAiEstimateDraft pipeline behind /admin/ai-estimate, but
 * embedded directly on the job's own Estimates page instead of only reachable
 * through a separate admin utility (jobId comes from the route, not a picker).
 * Always creates a real DRAFT Estimate — never locked, never sent to Budget — that
 * shows up in the list below like any hand-entered one.
 */
export async function draftJobEstimateAction(_previous: DraftEstimateActionState, formData: FormData): Promise<DraftEstimateActionState> {
  const user = await requireAppUser();

  const jobId = String(formData.get("jobId") ?? "");
  const notes = String(formData.get("notes") ?? "").trim();
  if (notes.length < 10) return { error: "Add a bit more detail — scope of work, measurements, anything relevant (at least 10 characters)." };

  const images = await filesToImageInputs(formData, "photos");

  try {
    const result = await createAiEstimateDraft({ organizationId: user.organizationId, jobId, notes, images });
    revalidatePath(`/jobs/${jobId}/estimates`);
    return { result: { title: result.title, lineItemCount: result.lineItemCount, assumptions: result.assumptions } };
  } catch (error) {
    if (error instanceof AiNotConfiguredError) return { error: "The AI assistant isn't configured yet — set ANTHROPIC_API_KEY in .env." };
    if (error instanceof AiJobNotFoundError || error instanceof NoCostCodesError || error instanceof DraftGenerationError) {
      return { error: error.message };
    }
    throw error;
  }
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
