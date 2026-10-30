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
  InspectionResult,
  InvoiceStatus,
  InvoiceType,
  JobStatus,
  PaymentMethod,
  PermitRockstarSetupType,
  PermitStatus,
  PermitTrade,
  PurchaseOrderStatus,
  RateMode,
} from "@/generated/prisma/enums";

const nullableTrimmed = z.string().trim().min(1).max(255).nullish();

export const createJobSchema = z.object({
  name: z.string().trim().min(1).max(255),
  contractType: z.enum(ContractType),
  prefix: z.string().trim().min(1).max(32).nullish(),
  jobGroupId: z.string().min(1).max(64).nullish(),
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
  jobGroupId: z.string().min(1).max(64).optional(),
  includeTemplates: z.coerce.boolean().optional().default(false),
  /** Case-insensitive match on name, prefix, or address fields. */
  q: z.string().trim().max(200).optional(),
  search: z.string().trim().max(200).optional(),
  // Default 25; max 200 with cursor pagination. Compact list tools should pass fields via select, not shrink this.
  limit: z.coerce.number().int().min(1).max(200).optional().default(25),
  cursor: z.string().min(1).max(64).optional(),
});

/**
 * Paging for the financial list endpoints. Same shape as listJobsQuerySchema on
 * purpose: those three hardcoded `take: 100` and ignored ?limit= entirely, so a
 * migration reading back what it had written silently saw only the first hundred
 * rows with nothing in the response to say more existed.
 */
const financialListPaging = {
  jobId: z.string().min(1).max(64).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional().default(25),
  cursor: z.string().min(1).max(64).optional(),
};

/** Shared limit+cursor for org-level list endpoints (clients, vendors, files, …). */
export const listPagingQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional().default(25),
  cursor: z.string().min(1).max(64).optional(),
});

export const listClientsQuerySchema = listPagingQuerySchema.extend({
  jobId: z.string().min(1).max(64).optional(),
});

export const listVendorsQuerySchema = listPagingQuerySchema.extend({
  jobId: z.string().min(1).max(64).optional(),
});

export const listFilesQuerySchema = listPagingQuerySchema.extend({
  jobId: z.string().min(1).max(64).optional(),
  category: z.enum(["DOCUMENT", "PHOTO", "VIDEO", "PRESALE_PHOTO", "PLAN"]).optional(),
  folderId: z.string().min(1).max(64).optional(),
});

export const listChangeOrdersQuerySchema = listPagingQuerySchema.extend({
  jobId: z.string().min(1).max(64).optional(),
  status: z.string().min(1).max(64).optional(),
});

export const listFoldersQuerySchema = z.object({
  jobId: z.string().min(1).max(64),
  /** When `inspection`, returns Inspection Pictures folders (ensures empty permit shells get typical inspections + FileFolders). */
  kind: z.enum(["document", "inspection", "all"]).optional().default("all"),
});

export const createFolderSchema = z
  .object({
    jobId: z.string().min(1).max(64),
    name: z.string().trim().min(1).max(120),
    /** `inspection` creates/links a JobPermitInspection folder; default is a Documents folder. */
    kind: z.enum(["document", "inspection"]).optional().default("document"),
    trade: z.enum(PermitTrade).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.kind !== "inspection" && value.trade !== undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["trade"],
        message: "trade is only valid when kind is inspection.",
      });
    }
  });

/** PATCH /folders/{folderId} — rename and/or portal visibility. */
export const updateFolderSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    clientVisible: z.boolean().optional(),
    subVisible: z.boolean().optional(),
  })
  .refine(
    (value) => value.name !== undefined || value.clientVisible !== undefined || value.subVisible !== undefined,
    { message: "Provide at least one of name, clientVisible, subVisible." },
  );

/** PATCH /files/{fileId} — move, rename, visibility. */
export const updateFileSchema = z
  .object({
    folderId: z.string().min(1).max(64).nullish(),
    fileName: z.string().trim().min(1).max(255).optional(),
    clientVisible: z.boolean().optional(),
    subVisible: z.boolean().optional(),
  })
  .refine(
    (value) =>
      value.folderId !== undefined ||
      value.fileName !== undefined ||
      value.clientVisible !== undefined ||
      value.subVisible !== undefined,
    { message: "Provide at least one of folderId, fileName, clientVisible, subVisible." },
  );

const jobStatusForHeal = z.enum(["PRE_SALE", "OPEN", "WARRANTY", "CLOSED"]);

/** POST /folders/heal-visibility — flip wrongly-public folders/cost docs to internal. */
export const healFileVisibilitySchema = z.object({
  jobId: z.string().min(1).max(64).optional(),
  jobStatuses: z.array(jobStatusForHeal).min(1).max(4).optional(),
});

export const issueInspectionShareLinkSchema = z.object({
  label: z.string().trim().max(120).nullish(),
  revokePrevious: z.boolean().optional(),
});

export const listTakeoffsQuerySchema = listPagingQuerySchema.extend({
  jobId: z.string().min(1).max(64).optional(),
});

export const listPurchaseOrdersQuerySchema = z.object({
  ...financialListPaging,
  status: z.enum(PurchaseOrderStatus).optional(),
});

export const listBillsQuerySchema = z.object({
  ...financialListPaging,
  approvalStatus: z.enum(BillApprovalStatus).optional(),
});

export const listInvoicesQuerySchema = z.object({
  ...financialListPaging,
  status: z.enum(InvoiceStatus).optional(),
});

export const transitionJobStatusSchema = z.object({
  status: z.enum(JobStatus),
  reason: z.string().trim().max(500).optional(),
});

export const createCostCodeSchema = z.object({
  code: z.string().trim().min(1).max(32),
  name: z.string().trim().min(1).max(255),
  defaultCostType: z.enum(CostType).optional().default(CostType.NONE),
  parentId: z.string().min(1).max(64).nullish(),
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
  costCodeId: z.string().min(1).max(64),
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
  jobId: z.string().min(1).max(64),
  title: z.string().trim().min(1).max(255),
  rateMode: rateMode.optional().default(RateMode.MARKUP),
  defaultRateBasisPoints: basisPoints.optional().default(0),
  lineItems: z.array(estimateLineItemSchema).min(1).max(500),
});

export const createPurchaseOrderSchema = z.object({
  jobId: z.string().min(1).max(64),
  poNumber: z.string().trim().min(1).max(64),
  poSuffix: z.string().trim().max(16).nullish(),
  vendorName: z.string().trim().min(1).max(255),
  /// Set only when the vendor has a Vendor Portal account (Phase 4).
  vendorId: z.string().min(1).max(64).nullish(),
  sourceType: z.enum(FinancialSourceType).optional().default(FinancialSourceType.SCRATCH),
  sourceId: z.string().trim().max(64).nullish(),
  lineItems: z
    .array(
      z.object({
        costCodeId: z.string().min(1).max(64),
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
  jobId: z.string().min(1).max(64),
  purchaseOrderId: z.string().min(1).max(64).nullish(),
  vendorName: z.string().trim().min(1).max(255),
  /// Set only when the vendor has a Vendor Portal account (Phase 4).
  vendorId: z.string().min(1).max(64).nullish(),
  billNumber: z.string().trim().max(64).nullish(),
  issuedOn: z.coerce.date().nullish(),
  dueOn: z.coerce.date().nullish(),
  fromOcr: z.boolean().optional(),
  lineItems: z
    .array(
      z.object({
        costCodeId: z.string().min(1).max(64),
        costType: z.enum(CostType).optional(),
        title: z.string().trim().min(1).max(255),
        amountCents: cents,
      }),
    )
    .min(1)
    .max(500),
});

export const updateBillStatusSchema = z
  .object({
    approvalStatus: z.enum(BillApprovalStatus),
    /**
     * Required when approvalStatus is READY_FOR_PAYMENT. true = push to QuickBooks
     * (labor/unpaid services); false = keep READY_FOR_PAYMENT in WCI only (materials).
     */
    sendToQuickBooks: z.boolean().optional(),
    /** Optional note when sendToQuickBooks is false. */
    quickBooksSkipReason: z.string().trim().max(500).nullable().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.approvalStatus === BillApprovalStatus.READY_FOR_PAYMENT && typeof value.sendToQuickBooks !== "boolean") {
      ctx.addIssue({
        code: "custom",
        path: ["sendToQuickBooks"],
        message:
          "sendToQuickBooks is required when marking a bill READY_FOR_PAYMENT (true = push to QuickBooks, false = keep in WCI only).",
      });
    }
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

/** POST /admin/heather-test-purge — explicit confirm so a preview GET cannot mutate. */
export const heatherTestPurgeSchema = z.object({
  confirm: z.literal(true),
});

export const aiDraftEstimateSchema = z.object({
  jobId: z.string().min(1).max(64),
  notes: z.string().trim().min(10).max(10_000),
});

export const aiDraftTakeoffSchema = z.object({
  jobId: z.string().min(1).max(64),
  notes: z.string().trim().min(10).max(10_000),
});

export const queueTakeoffPurchasingSchema = z.object({
  lineIds: z.array(z.string().min(1).max(64)).min(1).max(200).optional(),
  vendorHint: z.string().trim().min(1).max(255).nullish(),
  notes: z.string().trim().max(2_000).nullish(),
});

export const pushTakeoffToPurchaseOrderSchema = z.object({
  poNumber: z.string().trim().min(1).max(64),
  vendorName: z.string().trim().min(1).max(255),
  vendorId: z.string().min(1).max(64).nullish(),
  lineIds: z.array(z.string().min(1).max(64)).min(1).max(200).optional(),
  title: z.string().trim().min(1).max(255).nullish(),
});

export const listPurchasingIntentsQuerySchema = z.object({
  jobId: z.string().min(1).max(64).optional(),
  status: z.enum(["QUEUED", "CLAIMED", "CONVERTED", "CANCELLED"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
});

export const convertPurchasingIntentSchema = z.object({
  poNumber: z.string().trim().min(1).max(64),
  vendorName: z.string().trim().min(1).max(255),
  vendorId: z.string().min(1).max(64).nullish(),
});

const base64Pattern = /^[A-Za-z0-9+/]+=*$/;

const billOcrDocumentSchema = z.object({
  mediaType: z.enum(["image/png", "image/jpeg", "image/webp", "image/gif", "application/pdf"]),
  data: z.string().trim().min(1).max(30_000_000).regex(base64Pattern, "data must be base64-encoded"),
});

export const aiOcrBillSchema = z.object({
  jobId: z.string().min(1).max(64),
  vendorId: z.string().min(1).max(64).nullish(),
  document: billOcrDocumentSchema,
});

/** POST /vendor-portal/jobs/{jobId}/bills — jobId and vendorId come from the URL/session, not the body. */
export const portalUploadBillSchema = z.object({
  document: billOcrDocumentSchema,
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
  jobId: z.string().min(1).max(64),
  type: z.enum(InvoiceType),
  invoiceNumber: z.string().trim().min(1).max(64),
  title: z.string().trim().min(1).max(255).nullish(),
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
  jobId: z.string().min(1).max(64),
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
  userId: z.string().min(1).max(64),
  jobId: z.string().min(1).max(64),
  costCodeId: z.string().min(1).max(64),
  gps: gpsPointSchema.nullish(),
  overrideRateCents: z.number().int().positive().max(1_000_000).optional(),
});

export const bulkClockInSchema = z.object({
  jobId: z.string().min(1).max(64),
  costCodeId: z.string().min(1).max(64),
  userIds: z.array(z.string().min(1).max(64)).min(1).max(200),
  gps: gpsPointSchema.nullish(),
});

export const clockOutSchema = z.object({
  gps: gpsPointSchema.nullish(),
});

export const weeklyOvertimeQuerySchema = z.object({
  userId: z.string().min(1).max(64),
  weekStart: z.coerce.date(),
});

export const listTimeClockQuerySchema = z.object({
  jobId: z.string().min(1).max(64).optional(),
  userId: z.string().min(1).max(64).optional(),
  approvalStatus: z.enum(["PENDING", "APPROVED", "REJECTED"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
});

// ---------------------------------------------------------------------------
// Scheduling
// ---------------------------------------------------------------------------

export const createScheduleSchema = z.object({
  jobId: z.string().min(1).max(64),
  name: z.string().trim().min(1).max(255).optional(),
});

export const createScheduleItemSchema = z.object({
  title: z.string().trim().min(1).max(255),
  durationDays: z.number().int().min(1).max(3_650),
  predecessorIds: z.array(z.string().min(1).max(64)).max(50).optional(),
  lagDays: z.number().int().min(-365).max(365).optional(),
  manualStartDate: z.coerce.date().nullish(),
  clientVisible: z.boolean().optional(),
  subVisible: z.boolean().optional(),
  assigneeUserIds: z.array(z.string().min(1).max(64)).max(50).optional(),
});

export const updateScheduleItemSchema = z.object({
  title: z.string().trim().min(1).max(255).optional(),
  durationDays: z.number().int().min(1).max(3_650).optional(),
  predecessorIds: z.array(z.string().min(1).max(64)).max(50).optional(),
  lagDays: z.number().int().min(-365).max(365).optional(),
  manualStartDate: z.coerce.date().nullish(),
  confirmationStatus: z.enum(["UNCONFIRMED", "CONFIRMED"]).optional(),
  clientVisible: z.boolean().optional(),
  subVisible: z.boolean().optional(),
  assigneeUserIds: z.array(z.string().min(1).max(64)).max(50).optional(),
});

export const createNonWorkingDaySchema = z.object({
  date: z.coerce.date(),
  reason: z.string().trim().max(255).nullish(),
});

// ---------------------------------------------------------------------------
// Change Orders
// ---------------------------------------------------------------------------

const changeOrderLineItemSchema = z.object({
  costCodeId: z.string().min(1).max(64),
  costType: z.enum(CostType).optional(),
  title: z.string().trim().min(1).max(255),
  quantityMilli: quantityMilli.optional().default(1_000),
  unitCostCents: cents,
  rateMode: rateMode.optional().default(RateMode.MARKUP),
  rateBasisPoints: basisPoints.optional().default(0),
});

export const createChangeOrderSchema = z
  .object({
    jobId: z.string().min(1).max(64),
    title: z.string().trim().min(1).max(255),
    mode: z.enum(ChangeOrderMode),
    flatCostCodeId: z.string().min(1).max(64).optional(),
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
  jobId: z.string().min(1).max(64),
  // Author is stamped from the authenticating ApiKey — do not accept a User id
  // from the body (that would misattribute a bot write as a human).
  note: z.string().trim().min(1).max(10_000),
  title: z.string().trim().max(200).nullish(),
  clientVisible: z.boolean().optional(),
  subVisible: z.boolean().optional(),
});

export const listDailyLogsQuerySchema = z.object({
  jobId: z.string().min(1).max(64).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
});

export const createTodoSchema = z.object({
  jobId: z.string().min(1).max(64),
  title: z.string().trim().min(1).max(255),
  description: z.string().trim().max(5_000).nullish(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
  dueDate: z.coerce.date().nullish(),
  category: z.string().trim().max(64).nullish(),
  assigneeUserId: z.string().min(1).max(64).nullish(),
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
  jobId: z.string().min(1).max(64),
  title: z.string().trim().min(1).max(255),
  question: z.string().trim().min(1).max(10_000),
  dueDate: z.coerce.date().nullish(),
  assigneeUserId: z.string().min(1).max(64).nullish(),
  relatedItemRef: z.string().trim().max(255).nullish(),
});

export const answerRfiSchema = z.object({
  answer: z.string().trim().min(1).max(10_000),
});

const fileCategorySchema = z.enum(["DOCUMENT", "PHOTO", "VIDEO", "PRESALE_PHOTO", "PLAN"]);

/** URL-only registration (caller already hosted the bytes elsewhere). */
export const registerFileSchema = z.object({
  jobId: z.string().min(1).max(64),
  // Uploader is stamped from the authenticating ApiKey — not a body User id.
  fileName: z.string().trim().min(1).max(255),
  url: z.string().url().max(2_000),
  mimeType: z.string().trim().max(255).nullish(),
  sizeBytes: z.number().int().positive().max(10_000_000_000).nullish(),
  category: fileCategorySchema.optional(),
  clientVisible: z.boolean().optional(),
  subVisible: z.boolean().optional(),
  dailyLogId: z.string().min(1).max(64).nullish(),
  /** Put the file in a Documents or Inspection Pictures FileFolder on the same job. */
  folderId: z.string().min(1).max(64).nullish(),
});

/**
 * Upload bytes into Supabase job-files storage, then register the File row.
 * Prefer this (or multipart) for inspection photos — URL-only is the fallback.
 */
export const uploadFileJsonSchema = z.object({
  jobId: z.string().min(1).max(64),
  fileName: z.string().trim().min(1).max(255),
  /** Raw file bytes as base64 (no data: URL prefix required). */
  dataBase64: z.string().min(1).max(30_000_000),
  mimeType: z.string().trim().max(255).nullish(),
  category: fileCategorySchema.optional(),
  clientVisible: z.boolean().optional(),
  subVisible: z.boolean().optional(),
  dailyLogId: z.string().min(1).max(64).nullish(),
  folderId: z.string().min(1).max(64).nullish(),
});

// ---------------------------------------------------------------------------
// Comments / Notifications
// ---------------------------------------------------------------------------

export const createCommentSchema = z.object({
  featureType: z.string().trim().min(1).max(64),
  featureId: z.string().trim().min(1).max(64),
  // Author is stamped from the authenticating ApiKey.
  body: z.string().trim().min(1).max(10_000),
  mentions: z.array(z.string().min(1).max(64)).max(50).optional(),
});

export const listCommentsQuerySchema = z.object({
  featureType: z.string().trim().min(1).max(64),
  featureId: z.string().trim().min(1).max(64),
});

export const listNotificationsQuerySchema = z.object({
  userId: z.string().min(1).max(64),
  unreadOnly: z.coerce.boolean().optional().default(false),
  limit: z.coerce.number().int().min(1).max(200).optional().default(25),
  cursor: z.string().min(1).max(64).optional(),
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
  jobId: z.string().min(1).max(64),
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
  jobId: z.string().min(1).max(64),
  costCodeId: z.string().min(1).max(64),
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
  jobId: z.string().min(1).max(64),
  allowanceId: z.string().min(1).max(64).nullish(),
  title: z.string().trim().min(1).max(255),
  description: z.string().trim().max(5_000).nullish(),
  dueDate: z.coerce.date().nullish(),
  category: z.string().trim().max(255).nullish(),
  location: z.string().trim().max(255).nullish(),
  requireClientSelection: z.boolean().optional(),
  selectionType: z.enum(["SINGLE", "SHARED"]).optional(),
  /// Empty allowed: Buildertrend saves the selection first, then adds choices.
  options: z.array(createSelectionOptionInputSchema).max(50).default([]),
});

export const requestApprovalLinkSchema = z.object({
  clientId: z.string().min(1).max(64),
});

// ---------------------------------------------------------------------------
// Phase 4 — Sub/Vendor Portal, Bid Board
// ---------------------------------------------------------------------------

export const createVendorSchema = z.object({
  name: z.string().trim().min(1).max(255),
  tradeType: z.string().trim().max(255).nullish(),
  email: z.string().trim().toLowerCase().email().max(255),
  phone: z.string().trim().max(32).nullish(),
  addressLine1: nullableTrimmed,
  city: nullableTrimmed,
  state: z.string().trim().length(2).nullish(),
  postalCode: z.string().trim().min(3).max(16).nullish(),
});

export const grantVendorJobAccessSchema = z.object({
  jobId: z.string().min(1).max(64),
  scheduleScope: z.enum(["ASSIGNED_ONLY", "ALL_ITEMS"]).optional(),
  canViewDocuments: z.boolean().optional(),
  canViewPurchaseOrders: z.boolean().optional(),
  canViewBills: z.boolean().optional(),
});

export const addCertificationSchema = z.object({
  title: z.string().trim().min(1).max(255),
  expiresAt: z.coerce.date(),
  notes: z.string().trim().max(2_000).nullish(),
});

export const requestVendorApprovalLinkSchema = z.object({
  vendorId: z.string().min(1).max(64),
});

export const portalAcceptPurchaseOrderSchema = z.object({
  signatureName: z.string().trim().min(1).max(255).optional(),
});

const createBidPackageLineItemSchema = z.object({
  costCodeId: z.string().min(1).max(64).nullish(),
  title: z.string().trim().min(1).max(255),
  description: z.string().trim().max(2_000).nullish(),
  quantityMilli: z.number().int().positive().nullish(),
  unit: z.string().trim().max(32).nullish(),
});

export const createBidPackageSchema = z.object({
  jobId: z.string().min(1).max(64),
  title: z.string().trim().min(1).max(255),
  description: z.string().trim().max(5_000).nullish(),
  dueDate: z.coerce.date().nullish(),
  lineItems: z.array(createBidPackageLineItemSchema).max(200).optional(),
});

export const inviteVendorToBidSchema = z.object({
  vendorId: z.string().min(1).max(64),
});

const submitBidLineItemSchema = z.object({
  bidPackageLineItemId: z.string().min(1).max(64).nullish(),
  title: z.string().trim().min(1).max(255),
  quantityMilli: z.number().int().positive(),
  unitCostCents: z.number().int().nonnegative(),
});

export const submitBidSchema = z.object({
  totalCents: z.number().int().nonnegative().optional(),
  notes: z.string().trim().max(5_000).nullish(),
  lineItems: z.array(submitBidLineItemSchema).max(200).optional(),
});

export const closeBidPackageSchema = z.object({
  status: z.enum(["CLOSED", "AWARDED"]),
});

export const pushBidToPurchaseOrderSchema = z.object({
  poNumber: z.string().trim().min(1).max(64),
  fallbackCostCodeId: z.string().min(1).max(64).optional(),
});

// ---------------------------------------------------------------------------
// Phase 5 — CRM/Sales
// ---------------------------------------------------------------------------

export const createLeadSchema = z.object({
  name: z.string().trim().min(1).max(255),
  email: z.string().trim().toLowerCase().email().max(255).nullish(),
  phone: z.string().trim().max(32).nullish(),
  source: z.string().trim().max(255).nullish(),
  addressLine1: nullableTrimmed,
  city: nullableTrimmed,
  state: z.string().trim().length(2).nullish(),
  postalCode: z.string().trim().min(3).max(16).nullish(),
  notes: z.string().trim().max(10_000).nullish(),
  assignedUserId: z.string().min(1).max(64).nullish(),
});

export const updateLeadStageSchema = z.object({
  stage: z.enum(["NEW", "CONTACTED", "QUALIFIED", "PROPOSAL_SENT", "WON", "LOST"]),
});

/** Same shape as createJobSchema — converting a Lead creates a job exactly like POST /jobs. */
export const convertLeadToJobSchema = createJobSchema;

const proposalOptionSchema = z.object({
  estimateId: z.string().min(1).max(64),
  label: z.string().trim().min(1).max(100),
});

export const createProposalSchema = z.object({
  jobId: z.string().min(1).max(64),
  leadId: z.string().min(1).max(64).nullish(),
  clientId: z.string().min(1).max(64),
  title: z.string().trim().min(1).max(255),
  coverMessage: z.string().trim().max(10_000).nullish(),
  /** 1-5 priced options (task #116) — a single-option proposal auto-selects it. */
  options: z.array(proposalOptionSchema).min(1).max(5),
});

export const addProposalOptionSchema = proposalOptionSchema;

export const updateProposalOptionSchema = z.object({
  label: z.string().trim().min(1).max(100),
});

export const updateProposalBrandingSchema = z.object({
  accentColor: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, "accentColor must be a 6-digit hex color, e.g. #0f4c81")
    .nullish(),
  logoUrl: z.string().trim().url().max(2_000).nullish(),
});

export const submitProposalFeedbackSchema = z.object({
  feedback: z.string().trim().min(1).max(5_000),
});

export const portalAcceptProposalSchema = z.object({
  clientSignatureName: z.string().trim().min(1).max(255).optional(),
  optionId: z.string().min(1).max(64).optional(),
});

// ---------------------------------------------------------------------------
// Phase 6 — Specifications, Submittals, Warranty, Surveys
// ---------------------------------------------------------------------------

const createSpecificationSectionSchema = z.object({
  title: z.string().trim().min(1).max(255),
  body: z.string().trim().min(1).max(20_000),
});

export const createSpecificationSchema = z.object({
  jobId: z.string().min(1).max(64),
  title: z.string().trim().min(1).max(255),
  viewMode: z.enum(["BOOK_VIEW", "LIST_VIEW"]).optional(),
  sections: z.array(createSpecificationSectionSchema).max(200).optional(),
});

export const generateSpecificationFromEstimateSchema = z.object({
  jobId: z.string().min(1).max(64),
  estimateId: z.string().min(1).max(64),
  title: z.string().trim().min(1).max(255),
});

export const createSubmittalSchema = z.object({
  jobId: z.string().min(1).max(64),
  title: z.string().trim().min(1).max(255),
  type: z.enum(["MATERIAL_SPEC", "SHOP_DRAWING", "PRODUCT_DATA", "SAMPLE", "OTHER"]),
  documentUrl: z.string().url().max(2_000).nullish(),
  notes: z.string().trim().max(5_000).nullish(),
  description: z.string().trim().max(10_000).nullish(),
  packageName: z.string().trim().max(255).nullish(),
  division: z.string().trim().max(255).nullish(),
  specSection: z.string().trim().max(255).nullish(),
  finalDueDate: z.string().datetime().nullish(),
  managerUserId: z.string().min(1).max(64).nullish(),
  vendorId: z.string().min(1).max(64).nullish(),
});

export const addSubmittalRevisionSchema = z.object({
  documentUrl: z.string().url().max(2_000),
  notes: z.string().trim().max(5_000).nullish(),
});

export const issueSubmittalReviewLinkSchema = z.object({
  reviewerName: z.string().trim().min(1).max(255),
  reviewerEmail: z.string().trim().toLowerCase().email().max(255),
});

export const recordSubmittalReviewSchema = z.object({
  decision: z.enum(["APPROVED", "REJECTED", "REVISE_AND_RESUBMIT"]),
  comments: z.string().trim().max(5_000).nullish(),
});

export const createWarrantyClaimSchema = z.object({
  jobId: z.string().min(1).max(64),
  claimNumber: z.string().trim().min(1).max(64),
  title: z.string().trim().min(1).max(255),
  description: z.string().trim().min(1).max(10_000),
  submittedByName: z.string().trim().max(255).nullish(),
  submittedByEmail: z.string().trim().toLowerCase().email().max(255).nullish(),
  clientId: z.string().min(1).max(64).nullish(),
});

export const scheduleWarrantyAppointmentSchema = z.object({
  appointmentAt: z.coerce.date(),
  assignedVendorId: z.string().min(1).max(64).nullish(),
});

export const portalAcceptWarrantyWorkSchema = z.object({
  signatureName: z.string().trim().min(1).max(255).optional(),
});

const createSurveyQuestionSchema = z.object({
  prompt: z.string().trim().min(1).max(1_000),
});

export const createSurveySchema = z.object({
  jobId: z.string().min(1).max(64),
  title: z.string().trim().min(1).max(255),
  touchpoint: z.enum(["PRE_PROJECT", "MID_PROJECT", "POST_COMPLETION"]),
  questions: z.array(createSurveyQuestionSchema).min(1).max(50),
});

export const issueSurveyResponseLinkSchema = z.object({
  recipientName: z.string().trim().max(255).nullish(),
  recipientEmail: z.string().trim().toLowerCase().email().max(255).nullish(),
});

export const submitSurveyResponseSchema = z.object({
  answers: z.record(z.string(), z.string().trim().max(5_000)),
});

// ---------------------------------------------------------------------------
// AI layer (Phase 8) — weekly client-update summaries, agent-facing job summary.
// Receipt/bill OCR's schema (aiOcrBillSchema) lives next to createBillSchema above.
// ---------------------------------------------------------------------------

export const generateWeeklySummarySchema = z.object({
  jobId: z.string().min(1).max(64),
  /** Both optional — default to the last 7 days when omitted. */
  periodStart: z.coerce.date().optional(),
  periodEnd: z.coerce.date().optional(),
});

// ---------------------------------------------------------------------------
// Historical data migration (Buildertrend cutover) — see src/lib/migration/service.ts
// for why these differ from the live create*/registerFile schemas above: every field
// here that a live-workflow schema forces to a starting value or omits entirely
// (status, paidAt/approvedAt, createdAt) is exactly what a historical record needs to
// carry explicitly.
// ---------------------------------------------------------------------------

const migrationAttachmentSchema = z.object({
  url: z.string().url().max(2_000),
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().max(255).nullish(),
  sizeBytes: z.number().int().positive().max(10_000_000_000).nullish(),
  category: z.enum(["DOCUMENT", "PHOTO", "VIDEO", "PRESALE_PHOTO", "PLAN"]).optional(),
  createdAt: z.coerce.date().optional(),
});

export const importDailyLogSchema = z.object({
  jobId: z.string().min(1).max(64),
  authorUserId: z.string().min(1).max(64),
  note: z.string().trim().min(1).max(10_000),
  clientVisible: z.boolean().optional(),
  subVisible: z.boolean().optional(),
  createdAt: z.coerce.date(),
  /** Buildertrend weatherInformation JSON when present — never fabricate. */
  weather: z.record(z.string(), z.unknown()).nullish(),
  attachments: z.array(migrationAttachmentSchema).max(200).optional(),
});

export const importDailyLogsSchema = z.object({
  dailyLogs: z.array(importDailyLogSchema).min(1).max(100),
});

export const importPurchaseOrderSchema = z.object({
  jobId: z.string().min(1).max(64),
  uploadedByUserId: z.string().min(1).max(64),
  poNumber: z.string().trim().min(1).max(64),
  poSuffix: z.string().trim().max(16).nullish(),
  vendorName: z.string().trim().min(1).max(255),
  vendorId: z.string().min(1).max(64).nullish(),
  status: z.enum(PurchaseOrderStatus),
  approvedAt: z.coerce.date().nullish(),
  declinedAt: z.coerce.date().nullish(),
  createdAt: z.coerce.date(),
  lineItems: z
    .array(
      z.object({
        costCodeId: z.string().min(1).max(64),
        costType: z.enum(CostType).optional(),
        title: z.string().trim().min(1).max(255),
        quantityMilli: quantityMilli.optional().default(1_000),
        unitCostCents: cents,
      }),
    )
    .min(1)
    .max(500),
  attachments: z.array(migrationAttachmentSchema).max(200).optional(),
});

export const importPurchaseOrdersSchema = z.object({
  purchaseOrders: z.array(importPurchaseOrderSchema).min(1).max(100),
});

export const importBillSchema = z.object({
  jobId: z.string().min(1).max(64),
  uploadedByUserId: z.string().min(1).max(64),
  purchaseOrderId: z.string().min(1).max(64).nullish(),
  vendorName: z.string().trim().min(1).max(255),
  vendorId: z.string().min(1).max(64).nullish(),
  billNumber: z.string().trim().max(64).nullish(),
  approvalStatus: z.enum(BillApprovalStatus),
  issuedOn: z.coerce.date().nullish(),
  dueOn: z.coerce.date().nullish(),
  paidAt: z.coerce.date().nullish(),
  createdAt: z.coerce.date(),
  lineItems: z
    .array(
      z.object({
        costCodeId: z.string().min(1).max(64),
        costType: z.enum(CostType).optional(),
        title: z.string().trim().min(1).max(255),
        amountCents: cents,
      }),
    )
    .min(1)
    .max(500),
  attachments: z.array(migrationAttachmentSchema).max(200).optional(),
});

export const importBillsSchema = z.object({
  bills: z.array(importBillSchema).min(1).max(100),
});

export const importInvoiceSchema = z.object({
  jobId: z.string().min(1).max(64),
  uploadedByUserId: z.string().min(1).max(64),
  type: z.enum(InvoiceType),
  invoiceNumber: z.string().trim().min(1).max(64),
  status: z.enum(InvoiceStatus),
  amountCents: cents.optional(),
  lineItems: z.array(createInvoiceLineItemSchema).max(500).optional(),
  issuedOn: z.coerce.date().nullish(),
  dueOn: z.coerce.date().nullish(),
  paidAt: z.coerce.date().nullish(),
  voidedAt: z.coerce.date().nullish(),
  createdAt: z.coerce.date(),
  payments: z
    .array(
      z.object({
        method: z.enum(PaymentMethod),
        amountCents: z.number().int().positive().max(1_000_000_000),
        reference: z.string().trim().max(255).nullish(),
        receivedAt: z.coerce.date(),
      }),
    )
    .max(500)
    .optional(),
  attachments: z.array(migrationAttachmentSchema).max(200).optional(),
});

export const importInvoicesSchema = z.object({
  invoices: z.array(importInvoiceSchema).min(1).max(100),
});

export const importScheduleItemSchema = z.object({
  jobId: z.string().min(1).max(64),
  title: z.string().trim().min(1).max(255),
  durationDays: z.number().int().min(1).max(3_650),
  manualStartDate: z.coerce.date().nullish(),
  percentCompleteBasisPoints: z.number().int().min(0).max(10_000).optional(),
  clientVisible: z.boolean().optional(),
  subVisible: z.boolean().optional(),
  notesInternal: z.string().trim().max(10_000).nullish(),
  externalRef: z.string().trim().max(64).nullish(),
  /** BT calendarOffline → isOnline: !calendarOffline. */
  scheduleIsOnline: z.boolean().optional(),
});

export const importScheduleItemsSchema = z.object({
  scheduleItems: z.array(importScheduleItemSchema).min(1).max(100),
});

export const importScheduleFlagsSchema = z.object({
  jobId: z.string().min(1).max(64),
  isOnline: z.boolean(),
  isDraft: z.boolean().optional(),
});

// ---------------------------------------------------------------------------
// Permitting (Heather / Atlas / field ops)
// ---------------------------------------------------------------------------

const optionalDateTime = z.union([z.string().datetime({ offset: true }), z.string().datetime(), z.null()]).optional();

function parseOptionalDate(value: string | null | undefined): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  return new Date(value);
}

export const createJobPermitSchema = z.object({
  trade: z.enum(PermitTrade),
  label: z.string().trim().max(120).nullish(),
  permitNumber: z.string().trim().max(64).nullish(),
  vendorId: z.string().min(1).max(64).nullish(),
  status: z.enum(PermitStatus).optional(),
  issuedAt: optionalDateTime,
  expiresAt: optionalDateTime,
  jurisdiction: z.string().trim().max(120).nullish(),
  contractorName: z.string().trim().max(120).nullish(),
  /** Default true — seed typical inspections for the trade (editable afterward). */
  seedDefaultInspections: z.boolean().optional().default(true),
});

export const createPermitInspectionSchema = z.object({
  name: z.string().trim().min(1).max(120),
});

export const updatePermitSchema = z
  .object({
    pulled: z.boolean().optional(),
    vendorId: z.string().min(1).max(64).nullish(),
    permitNumber: z.string().trim().max(64).nullish(),
    label: z.string().trim().max(120).nullish(),
    status: z.enum(PermitStatus).optional(),
    issuedAt: optionalDateTime,
    expiresAt: optionalDateTime,
    jurisdiction: z.string().trim().max(120).nullish(),
    contractorName: z.string().trim().max(120).nullish(),
  })
  .refine(
    (value) =>
      value.pulled !== undefined ||
      value.vendorId !== undefined ||
      value.permitNumber !== undefined ||
      value.label !== undefined ||
      value.status !== undefined ||
      value.issuedAt !== undefined ||
      value.expiresAt !== undefined ||
      value.jurisdiction !== undefined ||
      value.contractorName !== undefined,
    {
      message:
        "Provide at least one of pulled, vendorId, permitNumber, label, status, issuedAt, expiresAt, jurisdiction, or contractorName.",
    },
  );

export const updatePermitInspectionSchema = z
  .object({
    completed: z.boolean().optional(),
    result: z.enum(InspectionResult).optional(),
    /** Real city pass/completed date (ISO) — distinct from system completedAt. */
    passedAt: optionalDateTime,
    confirmationNumber: z.string().trim().max(120).nullish(),
    inspector: z.string().trim().max(120).nullish(),
  })
  .refine(
    (value) =>
      value.completed !== undefined ||
      value.result !== undefined ||
      value.passedAt !== undefined ||
      value.confirmationNumber !== undefined ||
      value.inspector !== undefined,
    {
      message: "Provide at least one of completed, result, passedAt, confirmationNumber, or inspector.",
    },
  );

export { parseOptionalDate };

export const updateJobPermittingFlagsSchema = z
  .object({
    nocOnFile: z.boolean().optional(),
    ntboFiled: z.boolean().optional(),
    /** Mark / clear building permit doc pack created (header "Docs created"). */
    buildingPermitDocsCreated: z.boolean().optional(),
  })
  .refine(
    (value) =>
      value.nocOnFile !== undefined ||
      value.ntboFiled !== undefined ||
      value.buildingPermitDocsCreated !== undefined,
    {
      message: "Provide nocOnFile, ntboFiled, and/or buildingPermitDocsCreated.",
    },
  );

/**
 * One Permit Rockstar ledger per job (private provider / setup / invoiced / paid / fee).
 * feePerInspection is integer cents (null clears).
 */
export const updatePermitRockstarLedgerSchema = z
  .object({
    privateProvider: z.boolean().optional(),
    setupType: z.enum(PermitRockstarSetupType).nullish(),
    invoiced: z.boolean().optional(),
    paid: z.boolean().optional(),
    feePerInspectionCents: z.number().int().min(0).nullish(),
  })
  .refine(
    (value) =>
      value.privateProvider !== undefined ||
      value.setupType !== undefined ||
      value.invoiced !== undefined ||
      value.paid !== undefined ||
      value.feePerInspectionCents !== undefined,
    {
      message:
        "Provide at least one of privateProvider, setupType, invoiced, paid, or feePerInspectionCents.",
    },
  );

