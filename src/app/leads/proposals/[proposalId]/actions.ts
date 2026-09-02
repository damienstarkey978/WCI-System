"use server";

import { revalidatePath } from "next/cache";

import { ClientActionTokenPurpose } from "@/generated/prisma/enums";
import { requireAppUser } from "@/lib/auth";
import { ClientNotFoundError as ReviewLinkClientNotFoundError, issueApprovalLink } from "@/lib/client-portal/auth";
import { db } from "@/lib/db";
import {
  UnknownCostCodeError,
  EstimateLineItemNotFoundError,
  EstimateNotEditableError,
  EstimateNotFoundError,
  JobNotFoundError as EstimateJobNotFoundError,
  addEstimateLineItem,
  createEstimate,
  deleteEstimateLineItem,
  updateEstimateLineItem,
} from "@/lib/estimates/service";
import { MoneyError, parseDollarsToCents, parsePercentToBasisPoints } from "@/lib/money";
import {
  EstimateJobMismatchError as ProposalOptionEstimateJobMismatchError,
  EstimateNotFoundError as ProposalOptionEstimateNotFoundError,
  LastOptionError,
  ProposalNotDraftError,
  ProposalNotEditableError,
  ProposalNotFoundError,
  ProposalNotPendingError,
  ProposalOptionNotFoundError,
  ProposalSectionBulletNotFoundError,
  ProposalSectionNotFoundError,
  TooManyOptionsError,
  addProposalOption,
  addProposalSection,
  addProposalSectionBullet,
  declineProposal,
  deleteProposalSection,
  deleteProposalSectionBullet,
  removeProposalOption,
  sendProposal,
  updateProposalBranding,
  updateProposalCoverMessage,
  updateProposalOptionLabel,
  updateProposalSectionBullet,
  updateProposalSectionTitle,
} from "@/lib/proposals/service";

export interface ActionState {
  readonly error?: string;
  readonly ok?: boolean;
  readonly reviewUrl?: string;
}

const KNOWN_ERRORS = [
  EstimateNotFoundError,
  EstimateNotEditableError,
  EstimateLineItemNotFoundError,
  EstimateJobNotFoundError,
  UnknownCostCodeError,
  ProposalNotFoundError,
  ProposalNotEditableError,
  ProposalSectionNotFoundError,
  ProposalSectionBulletNotFoundError,
  ProposalOptionNotFoundError,
  ProposalOptionEstimateNotFoundError,
  ProposalOptionEstimateJobMismatchError,
  TooManyOptionsError,
  LastOptionError,
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

export async function addOptionAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireAppUser();
  const proposalId = String(formData.get("proposalId") ?? "");
  const label = String(formData.get("label") ?? "").trim();
  if (!label) return { error: "Option label is required." };

  const proposal = await db.proposal.findFirst({ where: { id: proposalId, organizationId: user.organizationId }, select: { jobId: true, leadId: true, title: true } });
  if (!proposal) return { error: `Proposal ${proposalId} not found` };

  try {
    const estimate = await createEstimate({
      organizationId: user.organizationId,
      jobId: proposal.jobId ?? undefined,
      leadId: proposal.jobId ? undefined : (proposal.leadId ?? undefined),
      title: `${proposal.title} — ${label}`,
      lineItems: [],
    });
    await addProposalOption(user.organizationId, proposalId, { estimateId: estimate.id, label });
  } catch (error) {
    const message = handled(error);
    if (message) return { error: message };
    throw error;
  }

  revalidate(proposalId);
  return { ok: true };
}

export async function updateOptionLabelAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireAppUser();
  const proposalId = String(formData.get("proposalId") ?? "");
  const optionId = String(formData.get("optionId") ?? "");
  const label = String(formData.get("label") ?? "").trim();
  if (!label) return { error: "Option label is required." };

  try {
    await updateProposalOptionLabel(user.organizationId, optionId, label);
  } catch (error) {
    const message = handled(error);
    if (message) return { error: message };
    throw error;
  }

  revalidate(proposalId);
  return { ok: true };
}

export async function removeOptionAction(formData: FormData): Promise<void> {
  const user = await requireAppUser();
  const proposalId = String(formData.get("proposalId") ?? "");
  const optionId = String(formData.get("optionId") ?? "");

  try {
    await removeProposalOption(user.organizationId, optionId);
  } catch (error) {
    if (!handled(error)) throw error;
  }

  revalidate(proposalId);
}

export async function updateBrandingAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireAppUser();
  const proposalId = String(formData.get("proposalId") ?? "");
  const accentColor = String(formData.get("accentColor") ?? "").trim();
  const logoUrl = String(formData.get("logoUrl") ?? "").trim();

  if (accentColor && !/^#[0-9a-fA-F]{6}$/.test(accentColor)) {
    return { error: "Accent color must be a 6-digit hex color, e.g. #0f4c81." };
  }

  try {
    await updateProposalBranding(user.organizationId, proposalId, { accentColor: accentColor || null, logoUrl: logoUrl || null });
  } catch (error) {
    const message = handled(error);
    if (message) return { error: message };
    throw error;
  }

  revalidate(proposalId);
  return { ok: true };
}

/**
 * Issue a headless review link for the client (src/lib/client-portal/auth.ts's
 * PROPOSAL_ACCEPTANCE token) — no email provider configured yet, so the raw link
 * is shown once for the salesperson to copy and send manually, same as
 * src/app/clients/[clientId]/invite-button.tsx's portal invite.
 */
export async function issueReviewLinkAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireAppUser();
  const proposalId = String(formData.get("proposalId") ?? "");

  const proposal = await db.proposal.findFirst({ where: { id: proposalId, organizationId: user.organizationId }, select: { clientId: true } });
  if (!proposal) return { error: `Proposal ${proposalId} not found` };

  try {
    const { token } = await issueApprovalLink({
      organizationId: user.organizationId,
      clientId: proposal.clientId,
      purpose: ClientActionTokenPurpose.PROPOSAL_ACCEPTANCE,
      resourceId: proposalId,
    });
    return { ok: true, reviewUrl: `/proposals/review/${token}` };
  } catch (error) {
    if (error instanceof ReviewLinkClientNotFoundError) return { error: error.message };
    throw error;
  }
}
