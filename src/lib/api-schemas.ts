/**
 * Request validation schemas for /api/v1. Shared between route handlers and tests so
 * the OpenAPI spec published in Phase 1 has one source of truth.
 */

import { z } from "zod";

import {
  BillApprovalStatus,
  ContractType,
  CostType,
  FinancialSourceType,
  InvoiceType,
  JobStatus,
  PaymentMethod,
  RateMode,
} from "@/generated/prisma/enums";

const nullableTrimmed = z.string().trim().min(1).max(255).nullish();

export const createJobSchema = z.object({
  name: z.string().trim().min(1).max(255),
  contractType: z.enum(ContractType),
  prefix: z.string().trim().min(1).max(32).nullish(),
  jobGroupId: z.string().cuid().nullish(),
  addressLine1: nullableTrimmed,
  addressLine2: nullableTrimmed,
  city: nullableTrimmed,
  state: z.string().trim().length(2).nullish(),
  postalCode: z.string().trim().min(3).max(16).nullish(),
  latitude: z.number().min(-90).max(90).nullish(),
  longitude: z.number().min(-180).max(180).nullish(),
  sqft: z.number().int().positive().nullish(),
  permitNumber: nullableTrimmed,
  lotInfo: nullableTrimmed,
  projectedStart: z.coerce.date().nullish(),
  projectedEnd: z.coerce.date().nullish(),
  scheduleColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "scheduleColor must be a hex color such as #1f6feb")
    .nullish(),
  customFields: z.record(z.string(), z.unknown()).optional(),
  isTemplate: z.boolean().optional(),
});

export type CreateJobInput = z.infer<typeof createJobSchema>;

export const listJobsQuerySchema = z.object({
  status: z.enum(JobStatus).optional(),
  contractType: z.enum(ContractType).optional(),
  jobGroupId: z.string().cuid().optional(),
  includeTemplates: z.coerce.boolean().optional().default(false),
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
  cursor: z.string().cuid().optional(),
});

export const transitionJobStatusSchema = z.object({
  status: z.enum(JobStatus),
  reason: z.string().trim().max(500).optional(),
});

export const createCostCodeSchema = z.object({
  code: z.string().trim().min(1).max(32),
  name: z.string().trim().min(1).max(255),
  defaultCostType: z.enum(CostType).optional().default(CostType.NONE),
  parentId: z.string().cuid().nullish(),
  sortOrder: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});

export const listCostCodesQuerySchema = z.object({
  includeInactive: z.coerce.boolean().optional().default(false),
  costType: z.enum(CostType).optional(),
});

/** Turn a Zod failure into the API's standard error detail shape. */
export function formatZodIssues(error: z.ZodError): ReadonlyArray<{ path: string; message: string }> {
  return error.issues.map((issue) => ({
    path: issue.path.join(".") || "(root)",
    message: issue.message,
  }));
}

// ---------------------------------------------------------------------------
// Phase 1 — financial core
// ---------------------------------------------------------------------------

const rateMode = z.enum(RateMode);
const quantityMilli = z.number().int().positive().max(1_000_000_000);
const cents = z.number().int().min(-1_000_000_000).max(1_000_000_000);
const basisPoints = z.number().int().min(-9_999).max(1_000_000);

export const estimateLineItemSchema = z.object({
  costCodeId: z.string().cuid(),
  costType: z.enum(CostType).optional(),
  title: z.string().trim().min(1).max(255),
  description: z.string().trim().max(2_000).nullish(),
  quantityMilli: quantityMilli.optional().default(1_000),
  unitCostCents: cents,
  rateMode: rateMode.optional(),
  rateBasisPoints: basisPoints.optional(),
  taxable: z.boolean().optional(),
  internalNote: z.string().trim().max(2_000).nullish(),
  groupLabel: z.string().trim().max(120).nullish(),
});

export const createEstimateSchema = z.object({
  jobId: z.string().cuid(),
  title: z.string().trim().min(1).max(255),
  rateMode: rateMode.optional().default(RateMode.MARKUP),
  defaultRateBasisPoints: basisPoints.optional().default(0),
  lineItems: z.array(estimateLineItemSchema).min(1).max(500),
});

export const createPurchaseOrderSchema = z.object({
  jobId: z.string().cuid(),
  poNumber: z.string().trim().min(1).max(64),
  poSuffix: z.string().trim().max(16).nullish(),
  vendorName: z.string().trim().min(1).max(255),
  sourceType: z.enum(FinancialSourceType).optional().default(FinancialSourceType.SCRATCH),
  sourceId: z.string().trim().max(64).nullish(),
  lineItems: z
    .array(
      z.object({
        costCodeId: z.string().cuid(),
        costType: z.enum(CostType).optional(),
        title: z.string().trim().min(1).max(255),
        quantityMilli: quantityMilli.optional().default(1_000),
        unitCostCents: cents,
      }),
    )
    .min(1)
    .max(500),
});

export const createBillSchema = z.object({
  jobId: z.string().cuid(),
  purchaseOrderId: z.string().cuid().nullish(),
  vendorName: z.string().trim().min(1).max(255),
  billNumber: z.string().trim().max(64).nullish(),
  issuedOn: z.coerce.date().nullish(),
  dueOn: z.coerce.date().nullish(),
  fromOcr: z.boolean().optional(),
  lineItems: z
    .array(
      z.object({
        costCodeId: z.string().cuid(),
        costType: z.enum(CostType).optional(),
        title: z.string().trim().min(1).max(255),
        amountCents: cents,
      }),
    )
    .min(1)
    .max(500),
});

export const updateBillStatusSchema = z.object({
  approvalStatus: z.enum(BillApprovalStatus),
});

export const matchByRoadNameSchema = z.object({
  query: z.string().trim().min(1).max(500),
  minimumScore: z.number().int().min(0).max(100).optional(),
  limit: z.number().int().min(1).max(25).optional(),
});

export const createWebhookSubscriptionSchema = z.object({
  name: z.string().trim().min(1).max(64),
  targetUrl: z.string().url().max(2_000),
  eventTypes: z.array(z.string().trim().min(1).max(64)).min(1).max(50),
});

export const emitEventSchema = z.object({
  eventType: z.string().trim().min(1).max(64),
  data: z.record(z.string(), z.unknown()).optional().default({}),
});

export const aiDraftEstimateSchema = z.object({
  jobId: z.string().cuid(),
  notes: z.string().trim().min(10).max(10_000),
});

// ---------------------------------------------------------------------------
// Invoicing, draw schedules, payments
// ---------------------------------------------------------------------------

export const createInvoiceLineItemSchema = z.object({
  title: z.string().trim().min(1).max(255),
  description: z.string().trim().max(1_000).nullish(),
  amountCents: cents,
});

export const createInvoiceSchema = z.object({
  jobId: z.string().cuid(),
  type: z.enum(InvoiceType),
  invoiceNumber: z.string().trim().min(1).max(64),
  issuedOn: z.coerce.date().nullish(),
  dueOn: z.coerce.date().nullish(),
  amountCents: cents.optional(),
  lineItems: z.array(createInvoiceLineItemSchema).max(500).optional(),
});

export const createDrawSchema = z.object({
  title: z.string().trim().min(1).max(255),
  pctOfContractBasisPoints: z.number().int().min(1).max(10_000),
  linkedScheduleItemId: z.string().trim().max(64).nullish(),
  autoGeneratesInvoiceOnDate: z.coerce.date().nullish(),
});

export const createDrawScheduleSchema = z.object({
  jobId: z.string().cuid(),
  name: z.string().trim().min(1).max(255).optional(),
  draws: z.array(createDrawSchema).min(1).max(50),
});

export const recordPaymentSchema = z.object({
  method: z.enum(PaymentMethod),
  amountCents: z.number().int().positive().max(1_000_000_000),
  reference: z.string().trim().max(255).nullish(),
  receivedAt: z.coerce.date().nullish(),
});

// ---------------------------------------------------------------------------
// Time clock
// ---------------------------------------------------------------------------

const gpsPointSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

export const clockInSchema = z.object({
  // Required: /api/v1 is API-key-only (CLAUDE.md 2.1), so there is no "current
  // user" session to default to. A human-facing field client (Phase 7's PWA) will
  // need its own session-authenticated path when it's built.
  userId: z.string().cuid(),
  jobId: z.string().cuid(),
  costCodeId: z.string().cuid(),
  gps: gpsPointSchema.nullish(),
  overrideRateCents: z.number().int().positive().max(1_000_000).optional(),
});

export const bulkClockInSchema = z.object({
  jobId: z.string().cuid(),
  costCodeId: z.string().cuid(),
  userIds: z.array(z.string().cuid()).min(1).max(200),
  gps: gpsPointSchema.nullish(),
});

export const clockOutSchema = z.object({
  gps: gpsPointSchema.nullish(),
});

export const weeklyOvertimeQuerySchema = z.object({
  userId: z.string().cuid(),
  weekStart: z.coerce.date(),
});

export const listTimeClockQuerySchema = z.object({
  jobId: z.string().cuid().optional(),
  userId: z.string().cuid().optional(),
  approvalStatus: z.enum(["PENDING", "APPROVED", "REJECTED"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
});
