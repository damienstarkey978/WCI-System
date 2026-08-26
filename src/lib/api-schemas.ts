/**
 * Request validation schemas for /api/v1. Shared between route handlers and tests so
 * the OpenAPI spec published in Phase 1 has one source of truth.
 */

import { z } from "zod";

import {
  BillApprovalStatus,
  ChangeOrderMode,
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

// ---------------------------------------------------------------------------
// Scheduling
// ---------------------------------------------------------------------------

export const createScheduleSchema = z.object({
  jobId: z.string().cuid(),
  name: z.string().trim().min(1).max(255).optional(),
});

export const createScheduleItemSchema = z.object({
  title: z.string().trim().min(1).max(255),
  durationDays: z.number().int().min(1).max(3_650),
  predecessorIds: z.array(z.string().cuid()).max(50).optional(),
  lagDays: z.number().int().min(-365).max(365).optional(),
  manualStartDate: z.coerce.date().nullish(),
  clientVisible: z.boolean().optional(),
  subVisible: z.boolean().optional(),
  assigneeUserIds: z.array(z.string().cuid()).max(50).optional(),
});

export const updateScheduleItemSchema = z.object({
  title: z.string().trim().min(1).max(255).optional(),
  durationDays: z.number().int().min(1).max(3_650).optional(),
  predecessorIds: z.array(z.string().cuid()).max(50).optional(),
  lagDays: z.number().int().min(-365).max(365).optional(),
  manualStartDate: z.coerce.date().nullish(),
  confirmationStatus: z.enum(["UNCONFIRMED", "CONFIRMED"]).optional(),
  clientVisible: z.boolean().optional(),
  subVisible: z.boolean().optional(),
  assigneeUserIds: z.array(z.string().cuid()).max(50).optional(),
});

export const createNonWorkingDaySchema = z.object({
  date: z.coerce.date(),
  reason: z.string().trim().max(255).nullish(),
});

// ---------------------------------------------------------------------------
// Change Orders
// ---------------------------------------------------------------------------

const changeOrderLineItemSchema = z.object({
  costCodeId: z.string().cuid(),
  costType: z.enum(CostType).optional(),
  title: z.string().trim().min(1).max(255),
  quantityMilli: quantityMilli.optional().default(1_000),
  unitCostCents: cents,
  rateMode: rateMode.optional().default(RateMode.MARKUP),
  rateBasisPoints: basisPoints.optional().default(0),
});

export const createChangeOrderSchema = z
  .object({
    jobId: z.string().cuid(),
    title: z.string().trim().min(1).max(255),
    mode: z.enum(ChangeOrderMode),
    flatCostCodeId: z.string().cuid().optional(),
    flatCostCents: cents.optional(),
    flatClientPriceCents: cents.optional(),
    lineItems: z.array(changeOrderLineItemSchema).max(500).optional(),
  })
  .refine(
    (input) =>
      input.mode !== ChangeOrderMode.FLAT ||
      (input.flatCostCodeId !== undefined && input.flatCostCents !== undefined && input.flatClientPriceCents !== undefined),
    { message: "FLAT change orders require flatCostCodeId, flatCostCents, and flatClientPriceCents." },
  )
  .refine((input) => input.mode !== ChangeOrderMode.ITEMIZED || (input.lineItems?.length ?? 0) > 0, {
    message: "ITEMIZED change orders require at least one line item.",
  });

export const approveChangeOrderSchema = z.object({
  clientSignatureName: z.string().trim().min(1).max(255).optional(),
  clientSignatureIp: z.string().trim().max(64).optional(),
});

export const pushChangeOrderToPurchaseOrderSchema = z.object({
  poNumber: z.string().trim().min(1).max(64),
  vendorName: z.string().trim().min(1).max(255),
});

// ---------------------------------------------------------------------------
// Daily Logs, Todos, RFIs, Files
// ---------------------------------------------------------------------------

export const createDailyLogSchema = z.object({
  jobId: z.string().cuid(),
  // Required: /api/v1 is API-key-only, so there is no session user to default to.
  authorUserId: z.string().cuid(),
  note: z.string().trim().min(1).max(10_000),
  clientVisible: z.boolean().optional(),
  subVisible: z.boolean().optional(),
});

export const listDailyLogsQuerySchema = z.object({
  jobId: z.string().cuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
});

export const createTodoSchema = z.object({
  jobId: z.string().cuid(),
  title: z.string().trim().min(1).max(255),
  description: z.string().trim().max(5_000).nullish(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
  dueDate: z.coerce.date().nullish(),
  category: z.string().trim().max(64).nullish(),
  assigneeUserId: z.string().cuid().nullish(),
  clientVisible: z.boolean().optional(),
  subVisible: z.boolean().optional(),
  checklistItems: z.array(z.string().trim().min(1).max(255)).max(100).optional(),
});

export const updateTodoStatusSchema = z.object({
  status: z.enum(["OPEN", "IN_PROGRESS", "DONE"]),
});

export const setChecklistItemDoneSchema = z.object({
  isDone: z.boolean(),
});

export const createRfiSchema = z.object({
  jobId: z.string().cuid(),
  title: z.string().trim().min(1).max(255),
  question: z.string().trim().min(1).max(10_000),
  dueDate: z.coerce.date().nullish(),
  assigneeUserId: z.string().cuid().nullish(),
  relatedItemRef: z.string().trim().max(255).nullish(),
});

export const answerRfiSchema = z.object({
  answer: z.string().trim().min(1).max(10_000),
});

export const registerFileSchema = z.object({
  jobId: z.string().cuid(),
  uploadedByUserId: z.string().cuid(),
  fileName: z.string().trim().min(1).max(255),
  url: z.string().url().max(2_000),
  mimeType: z.string().trim().max(255).nullish(),
  sizeBytes: z.number().int().positive().max(10_000_000_000).nullish(),
  category: z.enum(["DOCUMENT", "PHOTO", "VIDEO"]).optional(),
  clientVisible: z.boolean().optional(),
  subVisible: z.boolean().optional(),
  dailyLogId: z.string().cuid().nullish(),
});

// ---------------------------------------------------------------------------
// Comments / Notifications
// ---------------------------------------------------------------------------

export const createCommentSchema = z.object({
  featureType: z.string().trim().min(1).max(64),
  featureId: z.string().trim().min(1).max(64),
  authorUserId: z.string().cuid().nullish(),
  body: z.string().trim().min(1).max(10_000),
  mentions: z.array(z.string().cuid()).max(50).optional(),
});

export const listCommentsQuerySchema = z.object({
  featureType: z.string().trim().min(1).max(64),
  featureId: z.string().trim().min(1).max(64),
});

export const listNotificationsQuerySchema = z.object({
  userId: z.string().cuid(),
  unreadOnly: z.coerce.boolean().optional().default(false),
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
});

// ---------------------------------------------------------------------------
// Phase 3 — Client Portal, Selections & Allowances
// ---------------------------------------------------------------------------

export const createClientSchema = z.object({
  name: z.string().trim().min(1).max(255),
  email: z.string().trim().toLowerCase().email().max(255),
  phone: z.string().trim().max(32).nullish(),
});

const jobAccessFlags = {
  canViewDailyLogs: z.boolean().optional(),
  canViewSchedule: z.boolean().optional(),
  canViewDocuments: z.boolean().optional(),
  canViewBudget: z.boolean().optional(),
  canViewInvoices: z.boolean().optional(),
  canMakePayments: z.boolean().optional(),
  canViewBills: z.boolean().optional(),
  canViewSelections: z.boolean().optional(),
  canApproveSelections: z.boolean().optional(),
  canViewChangeOrders: z.boolean().optional(),
  canApproveChangeOrders: z.boolean().optional(),
};

export const grantJobAccessSchema = z.object({
  jobId: z.string().cuid(),
  ...jobAccessFlags,
});

/**
 * The portal login/approval token itself always travels as the request's
 * Authorization: Bearer header, same as an API key or a session token
 * (src/lib/api-auth.ts extractToken) — never in the JSON body. That keeps a
 * single rule at src/proxy.ts ("every /api/v1/* call needs an Authorization
 * or x-api-key header") true for every portal call too, login and headless
 * approvals included, with no path-specific carve-out.
 */
export const portalApproveChangeOrderSchema = z.object({
  clientSignatureName: z.string().trim().min(1).max(255).optional(),
});

export const createAllowanceSchema = z.object({
  jobId: z.string().cuid(),
  costCodeId: z.string().cuid(),
  title: z.string().trim().min(1).max(255),
  amountCents: z.number().int().nonnegative(),
  clientPriceCents: z.number().int().nonnegative(),
});

export const createSelectionOptionInputSchema = z.object({
  title: z.string().trim().min(1).max(255),
  description: z.string().trim().max(5_000).nullish(),
  priceCents: z.number().int().nonnegative(),
  clientPriceCents: z.number().int().nonnegative(),
});

export const createSelectionSchema = z.object({
  jobId: z.string().cuid(),
  allowanceId: z.string().cuid().nullish(),
  title: z.string().trim().min(1).max(255),
  description: z.string().trim().max(5_000).nullish(),
  dueDate: z.coerce.date().nullish(),
  options: z.array(createSelectionOptionInputSchema).min(1).max(50),
});

export const requestApprovalLinkSchema = z.object({
  clientId: z.string().cuid(),
});
