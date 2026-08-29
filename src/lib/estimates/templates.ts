/**
 * Estimate templates — CLAUDE.md 3's "template" entry method, alongside
 * line-by-line, cost-catalog pick, bulk cost-code add, and CSV import.
 * Deliberately a separate model from Estimate (see the schema comment on
 * EstimateTemplate) rather than a job-less Estimate: a template is reused
 * across many jobs, not attached to one.
 */

import { db } from "@/lib/db";
import { createEstimate, EstimateNotFoundError, JobNotFoundError, type CreateEstimateLineItemInput } from "@/lib/estimates/service";

export class EstimateTemplateNotFoundError extends Error {
  constructor(templateId: string) {
    super(`Estimate template ${templateId} not found`);
    this.name = "EstimateTemplateNotFoundError";
  }
}

export { EstimateNotFoundError, JobNotFoundError };

export async function listEstimateTemplates(organizationId: string) {
  return db.estimateTemplate.findMany({
    where: { organizationId },
    orderBy: { name: "asc" },
    include: { lineItems: { orderBy: { sortOrder: "asc" } } },
  });
}

/** "Save as template" — snapshots an existing estimate's current line items into a new reusable template. */
export async function createEstimateTemplateFromEstimate(organizationId: string, estimateId: string, name: string) {
  const estimate = await db.estimate.findFirst({
    where: { id: estimateId, organizationId },
    include: { lineItems: { orderBy: { sortOrder: "asc" } } },
  });
  if (!estimate) throw new EstimateNotFoundError(estimateId);

  return db.estimateTemplate.create({
    data: {
      organizationId,
      name,
      rateMode: estimate.rateMode,
      defaultRateBasisPoints: estimate.defaultRateBasisPoints,
      lineItems: {
        create: estimate.lineItems.map((item, index) => ({
          costCodeId: item.costCodeId,
          title: item.title,
          quantityMilli: item.quantityMilli,
          unitCostCents: item.unitCostCents,
          sortOrder: index,
        })),
      },
    },
    include: { lineItems: true },
  });
}

export async function deleteEstimateTemplate(organizationId: string, templateId: string): Promise<void> {
  await db.estimateTemplate.deleteMany({ where: { id: templateId, organizationId } });
}

/** "Use template" — creates a real Estimate for a job by copying a template's line items through the normal createEstimate path. */
export async function createEstimateFromTemplate(organizationId: string, jobId: string, templateId: string, title: string) {
  const template = await db.estimateTemplate.findFirst({
    where: { id: templateId, organizationId },
    include: { lineItems: { orderBy: { sortOrder: "asc" } } },
  });
  if (!template) throw new EstimateTemplateNotFoundError(templateId);

  const lineItems: CreateEstimateLineItemInput[] = template.lineItems.map((item) => ({
    costCodeId: item.costCodeId,
    title: item.title,
    quantityMilli: item.quantityMilli,
    unitCostCents: item.unitCostCents,
  }));

  return createEstimate({
    organizationId,
    jobId,
    title,
    rateMode: template.rateMode,
    defaultRateBasisPoints: template.defaultRateBasisPoints,
    lineItems,
  });
}
