"use server";

import { revalidatePath } from "next/cache";

import { LeadActivityType, RateMode } from "@/generated/prisma/enums";
import { requireAppUser } from "@/lib/auth";
import { createLeadActivity, LeadNotFoundError, setLeadActivityCompleted } from "@/lib/crm/service";
import { parseCostCodeLineItems } from "@/lib/financial/parse-line-items";
import {
  AiNotConfiguredError,
  DraftGenerationError,
  LeadMissingContactError,
  NoCostCodesError,
  createLeadProposal,
  draftLeadProposalFromNotes,
} from "@/lib/crm/lead-proposal";
import type { DraftEstimateImageInput } from "@/lib/ai/estimate-assistant";
import { parsePercentToBasisPoints } from "@/lib/money";
import { declineProposal, ProposalNotDraftError, ProposalNotFoundError, ProposalNotPendingError, sendProposal } from "@/lib/proposals/service";

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

export interface ActionState {
  readonly error?: string;
  readonly ok?: boolean;
}

const ACTIVITY_TYPES = new Set(Object.values(LeadActivityType) as string[]);

export async function createLeadActivityAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireAppUser();

  const leadId = String(formData.get("leadId") ?? "");
  const typeRaw = String(formData.get("type") ?? "NOTE");
  const type = ACTIVITY_TYPES.has(typeRaw) ? (typeRaw as LeadActivityType) : LeadActivityType.NOTE;
  const note = String(formData.get("note") ?? "").trim();
  const dueDateRaw = String(formData.get("dueDate") ?? "");

  if (!note) return { error: "A note is required." };

  try {
    await createLeadActivity({
      organizationId: user.organizationId,
      leadId,
      type,
      note,
      dueDate: dueDateRaw ? new Date(dueDateRaw) : null,
      createdByUserId: user.id,
    });
  } catch (error) {
    if (error instanceof LeadNotFoundError) return { error: error.message };
    throw error;
  }

  revalidatePath(`/leads/${leadId}`);
  return { ok: true };
}

export async function toggleLeadActivityCompletedAction(formData: FormData): Promise<void> {
  const user = await requireAppUser();

  const leadId = String(formData.get("leadId") ?? "");
  const activityId = String(formData.get("activityId") ?? "");
  const completed = formData.get("completed") === "true";

  await setLeadActivityCompleted(user.organizationId, activityId, completed);
  revalidatePath(`/leads/${leadId}`);
}

export async function createLeadProposalAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireAppUser();

  const leadId = String(formData.get("leadId") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const coverMessage = String(formData.get("coverMessage") ?? "").trim();
  const clientEmail = String(formData.get("clientEmail") ?? "").trim();
  const clientPhone = String(formData.get("clientPhone") ?? "").trim();
  const rateMode = String(formData.get("rateMode") ?? "MARKUP") === "MARGIN" ? RateMode.MARGIN : RateMode.MARKUP;
  const rateRaw = String(formData.get("defaultRate") ?? "0");

  if (!title) return { error: "Title is required." };

  try {
    const defaultRateBasisPoints = parsePercentToBasisPoints(rateRaw || "0");
    const lineItems = parseCostCodeLineItems(formData);
    if (lineItems.length === 0) return { error: "Add at least one line item." };

    await createLeadProposal({
      organizationId: user.organizationId,
      leadId,
      title,
      coverMessage: coverMessage || null,
      clientEmail: clientEmail || null,
      clientPhone: clientPhone || null,
      rateMode,
      defaultRateBasisPoints,
      lineItems,
    });
  } catch (error) {
    if (error instanceof LeadNotFoundError || error instanceof LeadMissingContactError) return { error: error.message };
    if (error instanceof Error && error.message.includes("Cannot parse")) return { error: error.message };
    throw error;
  }

  revalidatePath(`/leads/${leadId}`);
  return { ok: true };
}

export async function draftLeadProposalAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireAppUser();

  const leadId = String(formData.get("leadId") ?? "");
  const notes = String(formData.get("notes") ?? "").trim();
  const clientEmail = String(formData.get("clientEmail") ?? "").trim();
  const clientPhone = String(formData.get("clientPhone") ?? "").trim();

  if (notes.length < 10) return { error: "Add a bit more detail — scope of work, measurements, anything relevant (at least 10 characters)." };

  try {
    const images = await filesToImageInputs(formData, "photos");
    await draftLeadProposalFromNotes({
      organizationId: user.organizationId,
      leadId,
      userId: user.id,
      notes,
      images,
      clientEmail: clientEmail || null,
      clientPhone: clientPhone || null,
    });
  } catch (error) {
    if (error instanceof AiNotConfiguredError) return { error: "The AI assistant isn't configured yet — set ANTHROPIC_API_KEY in .env." };
    if (
      error instanceof LeadNotFoundError ||
      error instanceof LeadMissingContactError ||
      error instanceof NoCostCodesError ||
      error instanceof DraftGenerationError
    ) {
      return { error: error.message };
    }
    throw error;
  }

  revalidatePath(`/leads/${leadId}`);
  return { ok: true };
}

export async function sendProposalAction(formData: FormData): Promise<void> {
  const user = await requireAppUser();

  const leadId = String(formData.get("leadId") ?? "");
  const proposalId = String(formData.get("proposalId") ?? "");

  try {
    await sendProposal(user.organizationId, proposalId);
  } catch (error) {
    if (error instanceof ProposalNotFoundError || error instanceof ProposalNotDraftError) return;
    throw error;
  }

  revalidatePath(`/leads/${leadId}`);
}

export async function declineProposalAction(formData: FormData): Promise<void> {
  const user = await requireAppUser();

  const leadId = String(formData.get("leadId") ?? "");
  const proposalId = String(formData.get("proposalId") ?? "");

  try {
    await declineProposal(user.organizationId, proposalId);
  } catch (error) {
    if (error instanceof ProposalNotFoundError || error instanceof ProposalNotPendingError) return;
    throw error;
  }

  revalidatePath(`/leads/${leadId}`);
}
