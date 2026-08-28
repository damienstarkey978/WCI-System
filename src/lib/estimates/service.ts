/**
 * Estimate creation — extracted from src/app/api/v1/estimates/route.ts (mirroring
 * src/lib/bills/service.ts and src/lib/purchase-orders/service.ts) so a second
 * caller (the staff Estimate page) can create a real Estimate through the exact
 * same validation path instead of a parallel copy of it.
 */

import type { CostType, RateMode } from "@/generated/prisma/enums";
import { db } from "@/lib/db";
import type { BasisPoints } from "@/lib/money";

export class JobNotFoundError extends Error {
  constructor(jobId: string) {
    super(`No job ${jobId} in this organization.`);
    this.name = "JobNotFoundError";
  }
}

export class UnknownCostCodeError extends Error {
  constructor(public readonly unknownIds: readonly string[]) {
    super("One or more cost codes are not in this organization.");
    this.name = "UnknownCostCodeError";
  }
}

export interface CreateEstimateLineItemInput {
  readonly costCodeId: string;
  readonly costType?: CostType;
  readonly title: string;
  readonly description?: string | null;
  readonly quantityMilli?: number;
  readonly unitCostCents: number;
  readonly rateMode?: RateMode;
  readonly rateBasisPoints?: BasisPoints;
  readonly taxable?: boolean;
  readonly internalNote?: string | null;
  readonly groupLabel?: string | null;
}

export interface CreateEstimateInput {
  readonly organizationId: string;
  readonly jobId: string;
  readonly title: string;
  readonly rateMode?: RateMode;
  readonly defaultRateBasisPoints?: BasisPoints;
  readonly lineItems: readonly CreateEstimateLineItemInput[];
}

export async function createEstimate(input: CreateEstimateInput) {
  const job = await db.job.findFirst({ where: { id: input.jobId, organizationId: input.organizationId }, select: { id: true } });
  if (!job) throw new JobNotFoundError(input.jobId);

  const rateMode = input.rateMode ?? "MARKUP";
  const defaultRateBasisPoints = input.defaultRateBasisPoints ?? 0;

  const costCodeIds = [...new Set(input.lineItems.map((item) => item.costCodeId))];
  const known = await db.costCode.findMany({
    where: { id: { in: costCodeIds }, organizationId: input.organizationId },
    select: { id: true, defaultCostType: true },
  });
  if (known.length !== costCodeIds.length) {
    const knownIds = new Set(known.map((code) => code.id));
    throw new UnknownCostCodeError(costCodeIds.filter((id) => !knownIds.has(id)));
  }
  const defaultCostTypeById = new Map(known.map((code) => [code.id, code.defaultCostType]));

  return db.estimate.create({
    data: {
      organizationId: input.organizationId,
      jobId: input.jobId,
      title: input.title,
      rateMode,
      defaultRateBasisPoints,
      lineItems: {
        create: input.lineItems.map((item, index) => ({
          costCodeId: item.costCodeId,
          costType: item.costType ?? defaultCostTypeById.get(item.costCodeId) ?? "NONE",
          title: item.title,
          description: item.description ?? null,
          quantityMilli: item.quantityMilli ?? 1_000,
          unitCostCents: item.unitCostCents,
          rateMode: item.rateMode ?? rateMode,
          rateBasisPoints: item.rateBasisPoints ?? defaultRateBasisPoints,
          taxable: item.taxable ?? false,
          internalNote: item.internalNote ?? null,
          groupLabel: item.groupLabel ?? null,
          sortOrder: index,
        })),
      },
    },
    include: { lineItems: { orderBy: { sortOrder: "asc" } } },
  });
}
