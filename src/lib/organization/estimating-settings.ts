/**
 * Org estimating settings surface (Handoff parity CR P3 #29).
 * Markup, tax, default proposal template, terms — one GET/PATCH for agents.
 */

import { db } from "@/lib/db";
import type { BasisPoints } from "@/lib/money";
import type { RateMode } from "@/generated/prisma/enums";

export class OrganizationNotFoundError extends Error {
  constructor(organizationId: string) {
    super(`Organization ${organizationId} not found`);
    this.name = "OrganizationNotFoundError";
  }
}

export class DefaultProposalTemplateNotFoundError extends Error {
  constructor(templateId: string) {
    super(`Proposal template ${templateId} not found in this organization`);
    this.name = "DefaultProposalTemplateNotFoundError";
  }
}

export interface EstimatingSettings {
  readonly organizationId: string;
  readonly defaultEstimateRateMode: RateMode;
  readonly defaultEstimateRateBasisPoints: BasisPoints;
  readonly allowPerLineRateOverride: boolean;
  readonly defaultTaxRateBasisPoints: BasisPoints;
  readonly defaultProposalTerms: string | null;
  readonly defaultProposalTemplateId: string | null;
}

export async function getEstimatingSettings(organizationId: string): Promise<EstimatingSettings> {
  const org = await db.organization.findUnique({
    where: { id: organizationId },
    select: {
      id: true,
      defaultEstimateRateMode: true,
      defaultEstimateRateBasisPoints: true,
      allowPerLineRateOverride: true,
      defaultTaxRateBasisPoints: true,
      defaultProposalTerms: true,
      defaultProposalTemplateId: true,
    },
  });
  if (!org) throw new OrganizationNotFoundError(organizationId);
  return {
    organizationId: org.id,
    defaultEstimateRateMode: org.defaultEstimateRateMode,
    defaultEstimateRateBasisPoints: org.defaultEstimateRateBasisPoints,
    allowPerLineRateOverride: org.allowPerLineRateOverride,
    defaultTaxRateBasisPoints: org.defaultTaxRateBasisPoints,
    defaultProposalTerms: org.defaultProposalTerms,
    defaultProposalTemplateId: org.defaultProposalTemplateId,
  };
}

export interface UpdateEstimatingSettingsInput {
  readonly defaultEstimateRateMode?: RateMode;
  readonly defaultEstimateRateBasisPoints?: BasisPoints;
  readonly allowPerLineRateOverride?: boolean;
  readonly defaultTaxRateBasisPoints?: BasisPoints;
  readonly defaultProposalTerms?: string | null;
  readonly defaultProposalTemplateId?: string | null;
}

export async function updateEstimatingSettings(
  organizationId: string,
  input: UpdateEstimatingSettingsInput,
): Promise<EstimatingSettings> {
  await getEstimatingSettings(organizationId);

  if (input.defaultProposalTemplateId) {
    const template = await db.proposalTemplate.findFirst({
      where: { id: input.defaultProposalTemplateId, organizationId },
      select: { id: true },
    });
    if (!template) throw new DefaultProposalTemplateNotFoundError(input.defaultProposalTemplateId);
  }

  await db.organization.update({
    where: { id: organizationId },
    data: {
      ...(input.defaultEstimateRateMode !== undefined
        ? { defaultEstimateRateMode: input.defaultEstimateRateMode }
        : {}),
      ...(input.defaultEstimateRateBasisPoints !== undefined
        ? { defaultEstimateRateBasisPoints: input.defaultEstimateRateBasisPoints }
        : {}),
      ...(input.allowPerLineRateOverride !== undefined
        ? { allowPerLineRateOverride: input.allowPerLineRateOverride }
        : {}),
      ...(input.defaultTaxRateBasisPoints !== undefined
        ? { defaultTaxRateBasisPoints: input.defaultTaxRateBasisPoints }
        : {}),
      ...(input.defaultProposalTerms !== undefined
        ? { defaultProposalTerms: input.defaultProposalTerms }
        : {}),
      ...(input.defaultProposalTemplateId !== undefined
        ? { defaultProposalTemplateId: input.defaultProposalTemplateId }
        : {}),
    },
  });

  return getEstimatingSettings(organizationId);
}
