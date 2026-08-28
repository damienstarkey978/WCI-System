"use server";

import { revalidatePath } from "next/cache";

import { requireAppUser } from "@/lib/auth";
import {
  UnknownCostCodeError,
  EstimateLineItemNotFoundError,
  EstimateNotEditableError,
  EstimateNotFoundError,
  addEstimateLineItem,
  deleteEstimateLineItem,
  updateEstimateLineItem,
} from "@/lib/estimates/service";
import { MoneyError, parseDollarsToCents, parsePercentToBasisPoints } from "@/lib/money";
import {
  ProposalNotDraftError,
  ProposalNotEditableError,
  ProposalNotFoundError,
  ProposalNotPendingError,
  ProposalSectionBulletNotFoundError,
  ProposalSectionNotFoundError,
  addProposalSection,
  addProposalSectionBullet,
  declineProposal,
  deleteProposalSection,
  deleteProposalSectionBullet,
  sendProposal,
  updateProposalCoverMessage,
  updateProposalSectionBullet,
  updateProposalSectionTitle,
} from "@/lib/proposals/service";

export interface ActionState {
  readonly error?: string;
  readonly ok?: boolean;
}

const KNOWN_ERRORS = [
  EstimateNotFoundError,
  EstimateNotEditableError,
  EstimateLineItemNotFoundError,
  UnknownCostCodeError,
  ProposalNotFoundError,
  ProposalNotEditableError,
  ProposalSectionNotFoundError,
  ProposalSectionBulletNotFoundError,
  MoneyError,
];

function handled(error: unknown): string | null {
  for (const ctor of KNOWN_ERRORS) {
    if (error instanceof ctor) return error.message;
  }
  return null;
}

function revalidate(proposalId: string) {
  revalidatePath(`/leads/proposals/${proposalId}`);
}

export async function updateCoverMessageAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireAppUser();
  const proposalId = String(formData.get("proposalId") ?? "");
  const coverMessage = String(formData.get("coverMessage") ?? "").trim();

  try {
    await updateProposalCoverMessage(user.organizationId, proposalId, coverMessage || null);
  } catch (error) {
    const message = handled(error);
    if (message) return { error: message };
    throw error;
  }

  revalidate(proposalId);
  return { ok: true };
}

export async function addSectionAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireAppUser();
  const proposalId = String(formData.get("proposalId") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return { error: "Section title is required." };

  try {
    await addProposalSection(user.organizationId, proposalId, title);
  } catch (error) {
    const message = handled(error);
    if (message) return { error: message };
    throw error;
  }

  revalidate(proposalId);
  return { ok: true };
}

export async function updateSectionTitleAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireAppUser();
  const proposalId = String(formData.get("proposalId") ?? "");
  const sectionId = String(formData.get("sectionId") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return { error: "Section title is required." };

  try {
    await updateProposalSectionTitle(user.organizationId, sectionId, title);
  } catch (error) {
    const message = handled(error);
    if (message) return { error: message };
    throw error;
  }

  revalidate(proposalId);
  return { ok: true };
}

export async function deleteSectionAction(formData: FormData): Promise<void> {
  const user = await requireAppUser();
  const proposalId = String(formData.get("proposalId") ?? "");
  const sectionId = String(formData.get("sectionId") ?? "");

  try {
    await deleteProposalSection(user.organizationId, sectionId);
  } catch (error) {
    if (!handled(error)) throw error;
  }

  revalidate(proposalId);
}

export async function addBulletAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireAppUser();
  const proposalId = String(formData.get("proposalId") ?? "");
  const sectionId = String(formData.get("sectionId") ?? "");
  const text = String(formData.get("text") ?? "").trim();
  if (!text) return { error: "Bullet text is required." };

  try {
    await addProposalSectionBullet(user.organizationId, sectionId, text);
  } catch (error) {
    const message = handled(error);
    if (message) return { error: message };
    throw error;
  }

  revalidate(proposalId);
  return { ok: true };
}

export async function updateBulletAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireAppUser();
  const proposalId = String(formData.get("proposalId") ?? "");
  const bulletId = String(formData.get("bulletId") ?? "");
  const text = String(formData.get("text") ?? "").trim();
  if (!text) return { error: "Bullet text is required." };

  try {
    await updateProposalSectionBullet(user.organizationId, bulletId, text);
  } catch (error) {
    const message = handled(error);
    if (message) return { error: message };
    throw error;
  }

  revalidate(proposalId);
  return { ok: true };
}

export async function deleteBulletAction(formData: FormData): Promise<void> {
  const user = await requireAppUser();
  const proposalId = String(formData.get("proposalId") ?? "");
  const bulletId = String(formData.get("bulletId") ?? "");

  try {
    await deleteProposalSectionBullet(user.organizationId, bulletId);
  } catch (error) {
    if (!handled(error)) throw error;
  }

  revalidate(proposalId);
}

export async function addLineItemAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireAppUser();
  const proposalId = String(formData.get("proposalId") ?? "");
  const estimateId = String(formData.get("estimateId") ?? "");
  const costCodeId = String(formData.get("costCodeId") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const groupLabel = String(formData.get("groupLabel") ?? "").trim();
  const quantityRaw = String(formData.get("quantity") ?? "1");
  const unitCostRaw = String(formData.get("unitCost") ?? "0");
  const rateRaw = String(formData.get("ratePercent") ?? "0");

  if (!costCodeId) return { error: "Choose a cost code." };
  if (!title) return { error: "Title is required." };

  try {
    await addEstimateLineItem({
      organizationId: user.organizationId,
      estimateId,
      costCodeId,
      title,
      groupLabel: groupLabel || null,
      quantityMilli: Math.round(Number(quantityRaw || "1") * 1_000),
      unitCostCents: parseDollarsToCents(unitCostRaw || "0"),
      rateBasisPoints: parsePercentToBasisPoints(rateRaw || "0"),
    });
  } catch (error) {
    const message = handled(error);
    if (message) return { error: message };
    throw error;
  }

  revalidate(proposalId);
  return { ok: true };
}

export async function updateLineItemAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireAppUser();
  const proposalId = String(formData.get("proposalId") ?? "");
  const estimateId = String(formData.get("estimateId") ?? "");
  const lineItemId = String(formData.get("lineItemId") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const groupLabel = String(formData.get("groupLabel") ?? "").trim();
  const quantityRaw = String(formData.get("quantity") ?? "1");
  const unitCostRaw = String(formData.get("unitCost") ?? "0");
  const rateRaw = String(formData.get("ratePercent") ?? "0");

  if (!title) return { error: "Title is required." };

  try {
    await updateEstimateLineItem({
      organizationId: user.organizationId,
      estimateId,
      lineItemId,
      title,
      groupLabel: groupLabel || null,
      quantityMilli: Math.round(Number(quantityRaw || "1") * 1_000),
      unitCostCents: parseDollarsToCents(unitCostRaw || "0"),
      rateBasisPoints: parsePercentToBasisPoints(rateRaw || "0"),
    });
  } catch (error) {
    const message = handled(error);
    if (message) return { error: message };
    throw error;
  }

  revalidate(proposalId);
  return { ok: true };
}

export async function deleteLineItemAction(formData: FormData): Promise<void> {
  const user = await requireAppUser();
  const proposalId = String(formData.get("proposalId") ?? "");
  const estimateId = String(formData.get("estimateId") ?? "");
  const lineItemId = String(formData.get("lineItemId") ?? "");

  try {
    await deleteEstimateLineItem(user.organizationId, estimateId, lineItemId);
  } catch (error) {
    if (!handled(error)) throw error;
  }

  revalidate(proposalId);
}

export async function sendProposalPageAction(formData: FormData): Promise<void> {
  const user = await requireAppUser();
  const proposalId = String(formData.get("proposalId") ?? "");

  try {
    await sendProposal(user.organizationId, proposalId);
  } catch (error) {
    if (!(error instanceof ProposalNotFoundError) && !(error instanceof ProposalNotDraftError)) throw error;
  }

  revalidate(proposalId);
}

export async function declineProposalPageAction(formData: FormData): Promise<void> {
  const user = await requireAppUser();
  const proposalId = String(formData.get("proposalId") ?? "");

  try {
    await declineProposal(user.organizationId, proposalId);
  } catch (error) {
    if (!(error instanceof ProposalNotFoundError) && !(error instanceof ProposalNotPendingError)) throw error;
  }

  revalidate(proposalId);
}
