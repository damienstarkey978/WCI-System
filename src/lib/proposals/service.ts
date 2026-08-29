/**
 * Proposals (CLAUDE.md 2.3/3, Phase 5): the client-facing e-sign wrapper
 * around an Estimate. Pricing is never duplicated here — a Proposal carries
 * no line items of its own, only a reference to the Estimate that has them
 * (CLAUDE.md 5's "one place computes the numbers" principle, applied to
 * pricing display rather than pricing calculation).
 *
 * Acceptance is the "converts to a Job on acceptance" moment (CLAUDE.md 3):
 * it chains two already-existing, independently-tested actions —
 * transitionJobStatus(PRE_SALE -> OPEN) and sendEstimateToBudget() — rather
 * than reimplementing either. The PRE_SALE -> OPEN transition rule
 * ("Proposal accepted — job sold and under construction") was written in
 * Phase 0's job-status.ts specifically anticipating this.
 */

import { EstimateStatus, JobStatus, ProposalStatus } from "@/generated/prisma/enums";
import { sendEstimateToBudget } from "@/lib/budget/send-to-budget";
import { db } from "@/lib/db";
import { transitionJobStatus } from "@/lib/jobs";
import { emitEvent } from "@/lib/webhooks";

export class JobNotFoundError extends Error {
  constructor(jobId: string) {
    super(`Job ${jobId} not found`);
    this.name = "JobNotFoundError";
  }
}

export class EstimateNotFoundError extends Error {
  constructor(estimateId: string) {
    super(`Estimate ${estimateId} not found`);
    this.name = "EstimateNotFoundError";
  }
}

export class EstimateJobMismatchError extends Error {
  constructor(estimateId: string, jobId: string) {
    super(`Estimate ${estimateId} does not belong to job ${jobId}.`);
    this.name = "EstimateJobMismatchError";
  }
}

export class ClientNotFoundError extends Error {
  constructor(clientId: string) {
    super(`Client ${clientId} not found`);
    this.name = "ClientNotFoundError";
  }
}

export class ProposalNotFoundError extends Error {
  constructor(proposalId: string) {
    super(`Proposal ${proposalId} not found`);
    this.name = "ProposalNotFoundError";
  }
}

export class ProposalNotDraftError extends Error {
  constructor(proposalId: string, status: string) {
    super(`Proposal ${proposalId} is ${status} and cannot be sent.`);
    this.name = "ProposalNotDraftError";
  }
}

export class ProposalNotEditableError extends Error {
  constructor(proposalId: string, status: string) {
    super(`Proposal ${proposalId} is ${status} and can no longer be edited.`);
    this.name = "ProposalNotEditableError";
  }
}

export class ProposalSectionNotFoundError extends Error {
  constructor(sectionId: string) {
    super(`Proposal section ${sectionId} not found`);
    this.name = "ProposalSectionNotFoundError";
  }
}

export class ProposalSectionBulletNotFoundError extends Error {
  constructor(bulletId: string) {
    super(`Proposal section bullet ${bulletId} not found`);
    this.name = "ProposalSectionBulletNotFoundError";
  }
}

export class ProposalNotPendingError extends Error {
  constructor(proposalId: string, status: string) {
    super(`Proposal ${proposalId} is ${status} and cannot be accepted or declined.`);
    this.name = "ProposalNotPendingError";
  }
}

/** A ClientActionToken redeemed by a client other than the one this proposal was sent to. */
export class ProposalClientMismatchError extends Error {
  constructor(proposalId: string) {
    super(`This approval link does not belong to proposal ${proposalId}.`);
    this.name = "ProposalClientMismatchError";
  }
}

export class NoOptionsError extends Error {
  constructor() {
    super("A proposal needs at least one option.");
    this.name = "NoOptionsError";
  }
}

export const MAX_PROPOSAL_OPTIONS = 5;

export class TooManyOptionsError extends Error {
  constructor() {
    super(`A proposal can have at most ${MAX_PROPOSAL_OPTIONS} options.`);
    this.name = "TooManyOptionsError";
  }
}

export class ProposalOptionNotFoundError extends Error {
  constructor(optionId: string) {
    super(`Proposal option ${optionId} not found`);
    this.name = "ProposalOptionNotFoundError";
  }
}

export class LastOptionError extends Error {
  constructor(proposalId: string) {
    super(`Proposal ${proposalId} has only one option left — a proposal can't have zero.`);
    this.name = "LastOptionError";
  }
}

/** Accepting a multi-option proposal with no option chosen and none pre-selected. */
export class OptionSelectionRequiredError extends Error {
  constructor(proposalId: string) {
    super(`Proposal ${proposalId} has more than one option — choose which one to accept.`);
    this.name = "OptionSelectionRequiredError";
  }
}

export interface CreateProposalSectionInput {
  readonly title: string;
  readonly bullets: readonly string[];
}

export interface CreateProposalOptionInput {
  readonly estimateId: string;
  readonly label: string;
}

export interface CreateProposalInput {
  readonly organizationId: string;
  readonly jobId: string;
  readonly leadId?: string | null;
  readonly clientId: string;
  readonly title: string;
  readonly coverMessage?: string | null;
  /** 1-5 priced options (CLAUDE.md 3/task #116) — each estimate must belong to jobId. */
  readonly options: readonly CreateProposalOptionInput[];
  /// The client-facing narrative side of the estimate/proposal split (handoff.ai-style).
  /// Not FK-derived from the estimate's line items — generated together, then editable
  /// independently, so they can drift apart after a human edits either side.
  readonly sections?: readonly CreateProposalSectionInput[];
}

async function validateOptionEstimates(organizationId: string, jobId: string, estimateIds: readonly string[]) {
  const estimates = await db.estimate.findMany({
    where: { id: { in: [...estimateIds] }, organizationId },
    select: { id: true, jobId: true },
  });
  const byId = new Map(estimates.map((estimate) => [estimate.id, estimate]));
  for (const estimateId of estimateIds) {
    const estimate = byId.get(estimateId);
    if (!estimate) throw new EstimateNotFoundError(estimateId);
    if (estimate.jobId !== jobId) throw new EstimateJobMismatchError(estimateId, jobId);
  }
}

export async function createProposal(input: CreateProposalInput) {
  if (input.options.length === 0) throw new NoOptionsError();
  if (input.options.length > MAX_PROPOSAL_OPTIONS) throw new TooManyOptionsError();

  const job = await db.job.findFirst({ where: { id: input.jobId, organizationId: input.organizationId }, select: { id: true } });
  if (!job) throw new JobNotFoundError(input.jobId);

  await validateOptionEstimates(
    input.organizationId,
    input.jobId,
    input.options.map((option) => option.estimateId),
  );

  const client = await db.client.findFirst({ where: { id: input.clientId, organizationId: input.organizationId }, select: { id: true } });
  if (!client) throw new ClientNotFoundError(input.clientId);

  const proposal = await db.proposal.create({
    data: {
      organizationId: input.organizationId,
      jobId: input.jobId,
      leadId: input.leadId ?? null,
      clientId: input.clientId,
      title: input.title,
      coverMessage: input.coverMessage ?? null,
      options: {
        create: input.options.map((option, index) => ({ estimateId: option.estimateId, label: option.label, sortOrder: index })),
      },
      sections: input.sections?.length
        ? {
            create: input.sections.map((section, sectionIndex) => ({
              title: section.title,
              sortOrder: sectionIndex,
              bullets: {
                create: section.bullets.map((text, bulletIndex) => ({ text, sortOrder: bulletIndex })),
              },
            })),
          }
        : undefined,
    },
    include: { options: { orderBy: { sortOrder: "asc" } }, sections: { include: { bullets: true } } },
  });

  // A single-option proposal has no real choice to make — pre-select it so acceptance
  // works exactly like the old single-estimate flow, with nothing for the client to pick.
  if (proposal.options.length === 1) {
    return db.proposal.update({
      where: { id: proposal.id },
      data: { selectedOptionId: proposal.options[0].id },
      include: { options: { orderBy: { sortOrder: "asc" } }, sections: { include: { bullets: true } } },
    });
  }

  return proposal;
}

/** Add another priced option to a DRAFT proposal (up to MAX_PROPOSAL_OPTIONS total). */
export async function addProposalOption(organizationId: string, proposalId: string, input: CreateProposalOptionInput) {
  const proposal = await requireEditableProposal(organizationId, proposalId);
  const existingCount = await db.proposalOption.count({ where: { proposalId } });
  if (existingCount >= MAX_PROPOSAL_OPTIONS) throw new TooManyOptionsError();

  await validateOptionEstimates(organizationId, proposal.jobId, [input.estimateId]);

  const option = await db.proposalOption.create({ data: { proposalId, estimateId: input.estimateId, label: input.label, sortOrder: existingCount } });

  // A lone option was auto-selected at creation since there was no real choice to
  // make (see createProposal) — going to 2+ options reopens that choice, so the
  // earlier auto-selection no longer applies.
  if (existingCount === 1 && proposal.selectedOptionId) {
    await db.proposal.update({ where: { id: proposalId }, data: { selectedOptionId: null } });
  }

  return option;
}

async function findOptionForOrg(organizationId: string, optionId: string) {
  const option = await db.proposalOption.findFirst({ where: { id: optionId, proposal: { organizationId } }, include: { proposal: true } });
  if (!option) throw new ProposalOptionNotFoundError(optionId);
  if (option.proposal.status !== ProposalStatus.DRAFT) throw new ProposalNotEditableError(option.proposal.id, option.proposal.status);
  return option;
}

export async function updateProposalOptionLabel(organizationId: string, optionId: string, label: string) {
  await findOptionForOrg(organizationId, optionId);
  return db.proposalOption.update({ where: { id: optionId }, data: { label } });
}

/** Remove an option from a DRAFT proposal — refuses to leave a proposal with zero. */
export async function removeProposalOption(organizationId: string, optionId: string) {
  const option = await findOptionForOrg(organizationId, optionId);
  const siblings = await db.proposalOption.findMany({ where: { proposalId: option.proposalId }, select: { id: true } });
  if (siblings.length <= 1) throw new LastOptionError(option.proposalId);

  await db.proposalOption.delete({ where: { id: optionId } });

  // Back down to exactly one option — there's no real choice left, so pre-select
  // it the same way createProposal does for a proposal that only ever had one.
  if (siblings.length === 2) {
    const remaining = siblings.find((sibling) => sibling.id !== optionId);
    if (remaining) await db.proposal.update({ where: { id: option.proposalId }, data: { selectedOptionId: remaining.id } });
  }
}

export interface UpdateProposalBrandingInput {
  readonly accentColor?: string | null;
  readonly logoUrl?: string | null;
}

export async function updateProposalBranding(organizationId: string, proposalId: string, input: UpdateProposalBrandingInput) {
  await requireEditableProposal(organizationId, proposalId);
  return db.proposal.update({
    where: { id: proposalId },
    data: { ...(input.accentColor !== undefined ? { accentColor: input.accentColor } : {}), ...(input.logoUrl !== undefined ? { logoUrl: input.logoUrl } : {}) },
  });
}

/**
 * A client can leave feedback ("like Option B but swap the fixtures") any time the
 * proposal is SENT — independent of, and not gated by, the single-use approval link
 * accepting consumes, so a client can think it over across more than one visit.
 */
export async function submitProposalFeedback(organizationId: string, proposalId: string, feedback: string) {
  const proposal = await db.proposal.findFirst({ where: { id: proposalId, organizationId } });
  if (!proposal) throw new ProposalNotFoundError(proposalId);
  if (proposal.status !== ProposalStatus.SENT) throw new ProposalNotPendingError(proposalId, proposal.status);

  return db.proposal.update({ where: { id: proposal.id }, data: { clientFeedback: feedback, clientFeedbackAt: new Date() } });
}

/**
 * A Proposal is only editable — cover message, sections, bullets — while it's still a
 * DRAFT. Once sent, the client is looking at it; changing it silently underneath them
 * would defeat the point of e-signing what they were actually shown.
 */
async function requireEditableProposal(organizationId: string, proposalId: string) {
  const proposal = await db.proposal.findFirst({ where: { id: proposalId, organizationId } });
  if (!proposal) throw new ProposalNotFoundError(proposalId);
  if (proposal.status !== ProposalStatus.DRAFT) throw new ProposalNotEditableError(proposalId, proposal.status);
  return proposal;
}

export async function updateProposalCoverMessage(organizationId: string, proposalId: string, coverMessage: string | null) {
  await requireEditableProposal(organizationId, proposalId);
  return db.proposal.update({ where: { id: proposalId }, data: { coverMessage } });
}

export async function addProposalSection(organizationId: string, proposalId: string, title: string) {
  await requireEditableProposal(organizationId, proposalId);
  const last = await db.proposalSection.findFirst({ where: { proposalId }, orderBy: { sortOrder: "desc" }, select: { sortOrder: true } });
  return db.proposalSection.create({ data: { proposalId, title, sortOrder: (last?.sortOrder ?? -1) + 1 } });
}

async function findSectionForOrg(organizationId: string, sectionId: string) {
  const section = await db.proposalSection.findFirst({ where: { id: sectionId, proposal: { organizationId } }, include: { proposal: true } });
  if (!section) throw new ProposalSectionNotFoundError(sectionId);
  if (section.proposal.status !== ProposalStatus.DRAFT) throw new ProposalNotEditableError(section.proposal.id, section.proposal.status);
  return section;
}

export async function updateProposalSectionTitle(organizationId: string, sectionId: string, title: string) {
  await findSectionForOrg(organizationId, sectionId);
  return db.proposalSection.update({ where: { id: sectionId }, data: { title } });
}

export async function deleteProposalSection(organizationId: string, sectionId: string) {
  await findSectionForOrg(organizationId, sectionId);
  await db.proposalSection.delete({ where: { id: sectionId } });
}

export async function addProposalSectionBullet(organizationId: string, sectionId: string, text: string) {
  await findSectionForOrg(organizationId, sectionId);
  const last = await db.proposalSectionBullet.findFirst({ where: { sectionId }, orderBy: { sortOrder: "desc" }, select: { sortOrder: true } });
  return db.proposalSectionBullet.create({ data: { sectionId, text, sortOrder: (last?.sortOrder ?? -1) + 1 } });
}

async function findBulletForOrg(organizationId: string, bulletId: string) {
  const bullet = await db.proposalSectionBullet.findFirst({
    where: { id: bulletId, section: { proposal: { organizationId } } },
    include: { section: { include: { proposal: true } } },
  });
  if (!bullet) throw new ProposalSectionBulletNotFoundError(bulletId);
  if (bullet.section.proposal.status !== ProposalStatus.DRAFT) {
    throw new ProposalNotEditableError(bullet.section.proposal.id, bullet.section.proposal.status);
  }
  return bullet;
}

export async function updateProposalSectionBullet(organizationId: string, bulletId: string, text: string) {
  await findBulletForOrg(organizationId, bulletId);
  return db.proposalSectionBullet.update({ where: { id: bulletId }, data: { text } });
}

export async function deleteProposalSectionBullet(organizationId: string, bulletId: string) {
  await findBulletForOrg(organizationId, bulletId);
  await db.proposalSectionBullet.delete({ where: { id: bulletId } });
}

export async function sendProposal(organizationId: string, proposalId: string) {
  const proposal = await db.proposal.findFirst({ where: { id: proposalId, organizationId } });
  if (!proposal) throw new ProposalNotFoundError(proposalId);
  if (proposal.status !== ProposalStatus.DRAFT) throw new ProposalNotDraftError(proposalId, proposal.status);

  const updated = await db.proposal.update({
    where: { id: proposal.id },
    data: { status: ProposalStatus.SENT, sentAt: new Date() },
  });

  await emitEvent(organizationId, "proposal.sent", { proposalId: updated.id, jobId: updated.jobId });

  return updated;
}

export interface AcceptProposalInput {
  readonly organizationId: string;
  readonly proposalId: string;
  /**
   * Which option the client is accepting. Required when the proposal has more
   * than one option and none has been selected yet; ignored (falls back to
   * the existing selection) when the proposal only ever had one.
   */
  readonly optionId?: string;
  readonly clientSignatureName?: string;
  readonly clientSignatureIp?: string;
  /** Actor for the PRE_SALE -> OPEN transition's audit trail; API-key calls only. */
  readonly actorApiKeyId?: string;
}

/**
 * Accept a Proposal: settle which option won, e-sign it, move the Job from
 * PRE_SALE to OPEN, and send that option's Estimate to the Budget — the same
 * three facts CLAUDE.md 3 describes as one moment ("converts to a Job on
 * acceptance") but modeled as three separate, already-correct actions run
 * together rather than a fourth bespoke code path.
 */
export async function acceptProposal(input: AcceptProposalInput) {
  const proposal = await db.proposal.findFirst({
    where: { id: input.proposalId, organizationId: input.organizationId },
    include: { client: { select: { name: true } }, job: { select: { status: true } }, options: true },
  });
  if (!proposal) throw new ProposalNotFoundError(input.proposalId);
  if (proposal.status !== ProposalStatus.SENT) throw new ProposalNotPendingError(input.proposalId, proposal.status);

  let selectedOptionId = proposal.selectedOptionId;
  if (input.optionId) {
    const chosen = proposal.options.find((option) => option.id === input.optionId);
    if (!chosen) throw new ProposalOptionNotFoundError(input.optionId);
    selectedOptionId = chosen.id;
  }
  if (!selectedOptionId) {
    if (proposal.options.length === 1) {
      selectedOptionId = proposal.options[0].id;
    } else {
      throw new OptionSelectionRequiredError(input.proposalId);
    }
  }
  const selectedOption = proposal.options.find((option) => option.id === selectedOptionId);
  if (!selectedOption) throw new ProposalOptionNotFoundError(selectedOptionId);

  const updated = await db.proposal.update({
    where: { id: proposal.id },
    data: {
      status: ProposalStatus.ACCEPTED,
      selectedOptionId: selectedOption.id,
      clientSignatureName: input.clientSignatureName ?? proposal.client.name,
      clientSignedAt: new Date(),
      clientSignatureIp: input.clientSignatureIp ?? null,
    },
  });

  // The Job may already be OPEN (e.g. re-signing a revised proposal on a job
  // whose earlier proposal already opened it) — only transition when needed.
  if (proposal.job.status === JobStatus.PRE_SALE) {
    await transitionJobStatus({
      jobId: proposal.jobId,
      organizationId: input.organizationId,
      to: JobStatus.OPEN,
      actor: input.actorApiKeyId ? { kind: "apiKey", apiKeyId: input.actorApiKeyId } : undefined,
      reason: `Proposal ${proposal.id} accepted`,
    });
  }

  const estimate = await db.estimate.findUniqueOrThrow({ where: { id: selectedOption.estimateId }, select: { status: true, sentToBudgetAt: true } });
  if (estimate.sentToBudgetAt === null) {
    await sendEstimateToBudget({ estimateId: selectedOption.estimateId, organizationId: input.organizationId });
    if (estimate.status !== EstimateStatus.ACCEPTED) {
      await db.estimate.update({ where: { id: selectedOption.estimateId }, data: { status: EstimateStatus.ACCEPTED, acceptedAt: new Date() } });
    }
  }

  await emitEvent(input.organizationId, "proposal.accepted", { proposalId: updated.id, jobId: updated.jobId, estimateId: selectedOption.estimateId });

  return updated;
}

export async function declineProposal(organizationId: string, proposalId: string) {
  const proposal = await db.proposal.findFirst({ where: { id: proposalId, organizationId } });
  if (!proposal) throw new ProposalNotFoundError(proposalId);
  if (proposal.status !== ProposalStatus.SENT) throw new ProposalNotPendingError(proposalId, proposal.status);

  const updated = await db.proposal.update({
    where: { id: proposal.id },
    data: { status: ProposalStatus.DECLINED, declinedAt: new Date() },
  });

  await emitEvent(organizationId, "proposal.declined", { proposalId: updated.id, jobId: updated.jobId });

  return updated;
}
