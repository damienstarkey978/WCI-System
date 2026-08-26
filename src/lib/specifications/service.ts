/**
 * Specifications (CLAUDE.md 2.3/3, Phase 6): manual or auto-generated from an
 * Estimate. Portal visibility rides on ClientJobAccess.canViewDocuments — a
 * spec is a document, not its own permission dimension.
 */

import { db } from "@/lib/db";

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

export interface CreateSpecificationSectionInput {
  readonly title: string;
  readonly body: string;
}

export interface CreateSpecificationInput {
  readonly organizationId: string;
  readonly jobId: string;
  readonly title: string;
  readonly viewMode?: "BOOK_VIEW" | "LIST_VIEW";
  readonly sections?: readonly CreateSpecificationSectionInput[];
}

export async function createSpecification(input: CreateSpecificationInput) {
  const job = await db.job.findFirst({ where: { id: input.jobId, organizationId: input.organizationId }, select: { id: true } });
  if (!job) throw new JobNotFoundError(input.jobId);

  return db.specification.create({
    data: {
      organizationId: input.organizationId,
      jobId: input.jobId,
      title: input.title,
      viewMode: input.viewMode ?? "LIST_VIEW",
      sections: {
        create: (input.sections ?? []).map((section, index) => ({
          title: section.title,
          body: section.body,
          sortOrder: index,
        })),
      },
    },
    include: { sections: { orderBy: { sortOrder: "asc" } } },
  });
}

/**
 * Auto-generate a Specification from an Estimate's line items, one section
 * per groupLabel (the same room/assembly grouping the Estimate worksheet
 * already uses) — never re-entered by hand.
 */
export async function generateSpecificationFromEstimate(organizationId: string, jobId: string, estimateId: string, title: string) {
  const estimate = await db.estimate.findFirst({
    where: { id: estimateId, organizationId },
    include: { lineItems: { orderBy: { sortOrder: "asc" } } },
  });
  if (!estimate) throw new EstimateNotFoundError(estimateId);
  if (estimate.jobId !== jobId) throw new EstimateJobMismatchError(estimateId, jobId);

  const job = await db.job.findFirst({ where: { id: jobId, organizationId }, select: { id: true } });
  if (!job) throw new JobNotFoundError(jobId);

  const groups = new Map<string, string[]>();
  for (const line of estimate.lineItems) {
    const key = line.groupLabel ?? "General";
    const lines = groups.get(key) ?? [];
    lines.push(`- ${line.title}${line.description ? ` — ${line.description}` : ""}`);
    groups.set(key, lines);
  }

  return db.specification.create({
    data: {
      organizationId,
      jobId,
      title,
      sourceEstimateId: estimateId,
      sections: {
        create: Array.from(groups.entries()).map(([sectionTitle, lines], index) => ({
          title: sectionTitle,
          body: lines.join("\n"),
          sortOrder: index,
        })),
      },
    },
    include: { sections: { orderBy: { sortOrder: "asc" } } },
  });
}
