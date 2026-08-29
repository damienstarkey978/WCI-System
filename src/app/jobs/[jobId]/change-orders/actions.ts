"use server";

import { revalidatePath } from "next/cache";

import { AiNotConfiguredError, DraftGenerationError, type DraftEstimateImageInput } from "@/lib/ai/estimate-assistant";
import { createAiChangeOrderDraft, NoCostCodesError } from "@/lib/ai/service";
import { ChangeOrderMode, RateMode } from "@/generated/prisma/enums";
import { requireAppUser } from "@/lib/auth";
import {
  approveChangeOrder,
  ChangeOrderNotFoundError,
  ChangeOrderNotPendingError,
  createChangeOrder,
  declineChangeOrder,
  JobNotFoundError,
  JobNotOpenError,
} from "@/lib/change-orders/service";
import { parseCostCodeLineItems } from "@/lib/financial/parse-line-items";
import { parseDollarsToCents, parsePercentToBasisPoints } from "@/lib/money";

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

export interface DraftChangeOrderActionState {
  readonly error?: string;
  readonly result?: {
    readonly title: string;
    readonly lineItemCount: number;
    readonly assumptions: readonly string[];
  };
}

/**
 * "Draft with AI" (handoff-ai-analysis-and-jarvis-deep-integration-spec.md Part
 * 3.3b) — reuses the same estimate-drafting pipeline as the Estimates page
 * (src/lib/ai/service.ts's createAiChangeOrderDraft), just persisted as an
 * ITEMIZED ChangeOrder instead of an Estimate. Always DRAFT — approving it (the
 * step that actually touches the Budget) is still a separate human action.
 */
export async function draftChangeOrderAction(_previous: DraftChangeOrderActionState, formData: FormData): Promise<DraftChangeOrderActionState> {
  const user = await requireAppUser();

  const jobId = String(formData.get("jobId") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  if (!title) return { error: "Title is required." };
  if (notes.length < 10) return { error: "Describe what changed in a bit more detail (at least 10 characters)." };

  const images = await filesToImageInputs(formData, "photos");

  try {
    const result = await createAiChangeOrderDraft({ organizationId: user.organizationId, jobId, title, notes, images });
    revalidatePath(`/jobs/${jobId}/change-orders`);
    return { result: { title: result.title, lineItemCount: result.lineItemCount, assumptions: result.assumptions } };
  } catch (error) {
    if (error instanceof AiNotConfiguredError) return { error: "The AI assistant isn't configured yet — set ANTHROPIC_API_KEY in .env." };
    if (error instanceof JobNotFoundError || error instanceof JobNotOpenError || error instanceof NoCostCodesError || error instanceof DraftGenerationError) {
      return { error: error.message };
    }
    throw error;
  }
}

export async function createChangeOrderAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireAppUser();

  const jobId = String(formData.get("jobId") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const mode = String(formData.get("mode") ?? "FLAT") === "ITEMIZED" ? ChangeOrderMode.ITEMIZED : ChangeOrderMode.FLAT;

  if (!title) return { error: "Title is required." };

  try {
    if (mode === ChangeOrderMode.FLAT) {
      const flatCostCodeId = String(formData.get("flatCostCodeId") ?? "");
      const flatCostRaw = String(formData.get("flatCost") ?? "");
      const flatClientPriceRaw = String(formData.get("flatClientPrice") ?? "");
      if (!flatCostCodeId) return { error: "Choose a cost code." };
      if (!flatCostRaw || !flatClientPriceRaw) return { error: "Cost and client price are required." };

      await createChangeOrder({
        organizationId: user.organizationId,
        jobId,
        title,
        mode,
        flatCostCodeId,
        flatCostCents: parseDollarsToCents(flatCostRaw),
        flatClientPriceCents: parseDollarsToCents(flatClientPriceRaw),
      });
    } else {
      const rateMode = String(formData.get("rateMode") ?? "MARKUP") === "MARGIN" ? RateMode.MARGIN : RateMode.MARKUP;
      const rateBasisPoints = parsePercentToBasisPoints(String(formData.get("rate") ?? "0") || "0");
      const lineItems = parseCostCodeLineItems(formData).map((item) => ({ ...item, rateMode, rateBasisPoints }));
      if (lineItems.length === 0) return { error: "Add at least one line item." };

      await createChangeOrder({ organizationId: user.organizationId, jobId, title, mode, lineItems });
    }
  } catch (error) {
    if (error instanceof JobNotFoundError || error instanceof JobNotOpenError) return { error: error.message };
    if (error instanceof Error && error.message.includes("Cannot parse")) return { error: error.message };
    throw error;
  }

  revalidatePath(`/jobs/${jobId}/change-orders`);
  return { ok: true };
}

export async function approveChangeOrderAction(formData: FormData): Promise<void> {
  const user = await requireAppUser();

  const jobId = String(formData.get("jobId") ?? "");
  const changeOrderId = String(formData.get("changeOrderId") ?? "");

  try {
    await approveChangeOrder({ organizationId: user.organizationId, changeOrderId });
  } catch (error) {
    if (error instanceof ChangeOrderNotFoundError || error instanceof ChangeOrderNotPendingError) return;
    throw error;
  }

  revalidatePath(`/jobs/${jobId}/change-orders`);
}

export async function declineChangeOrderAction(formData: FormData): Promise<void> {
  const user = await requireAppUser();

  const jobId = String(formData.get("jobId") ?? "");
  const changeOrderId = String(formData.get("changeOrderId") ?? "");

  try {
    await declineChangeOrder(user.organizationId, changeOrderId);
  } catch (error) {
    if (error instanceof ChangeOrderNotFoundError || error instanceof ChangeOrderNotPendingError) return;
    throw error;
  }

  revalidatePath(`/jobs/${jobId}/change-orders`);
}
