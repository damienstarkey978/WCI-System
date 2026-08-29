/**
 * OpenAPI 3.1 document for /api/v1, generated from the same Zod schemas the route
 * handlers validate against (src/lib/api-schemas.ts) rather than hand-written and
 * left to drift. Request bodies come straight from `z.toJSONSchema()`; scopes and
 * paths are transcribed directly from the route files (see the comment on each
 * entry) rather than reconstructed from memory.
 *
 * Served at GET /api/v1/openapi.json — the one endpoint under /api/v1 that does
 * NOT require an API key (src/proxy.ts special-cases it), since an integrator
 * needs to be able to read the contract before they have credentials to call it.
 */

import { z } from "zod";

import {
  addCertificationSchema,
  addSubmittalRevisionSchema,
  aiDraftEstimateSchema,
  aiOcrBillSchema,
  answerRfiSchema,
  approveChangeOrderSchema,
  bulkClockInSchema,
  clockInSchema,
  clockOutSchema,
  closeBidPackageSchema,
  convertLeadToJobSchema,
  createAllowanceSchema,
  createBidPackageSchema,
  createBillSchema,
  createChangeOrderSchema,
  createClientSchema,
  createCommentSchema,
  createCostCodeSchema,
  createDailyLogSchema,
  createDrawScheduleSchema,
  createEstimateSchema,
  createInvoiceSchema,
  createJobSchema,
  createLeadSchema,
  createNonWorkingDaySchema,
  createProposalSchema,
  createPurchaseOrderSchema,
  createRfiSchema,
  createScheduleItemSchema,
  createScheduleSchema,
  createSelectionSchema,
  createSpecificationSchema,
  createSubmittalSchema,
  createSurveySchema,
  createTodoSchema,
  createVendorSchema,
  createWarrantyClaimSchema,
  createWebhookSubscriptionSchema,
  emitEventSchema,
  generateSpecificationFromEstimateSchema,
  generateWeeklySummarySchema,
  grantJobAccessSchema,
  grantVendorJobAccessSchema,
  inviteVendorToBidSchema,
  issueSubmittalReviewLinkSchema,
  issueSurveyResponseLinkSchema,
  matchByRoadNameSchema,
  portalAcceptProposalSchema,
  portalAcceptPurchaseOrderSchema,
  portalAcceptWarrantyWorkSchema,
  portalApproveChangeOrderSchema,
  portalUploadBillSchema,
  pushBidToPurchaseOrderSchema,
  pushChangeOrderToPurchaseOrderSchema,
  recordPaymentSchema,
  recordSubmittalReviewSchema,
  registerFileSchema,
  requestApprovalLinkSchema,
  requestVendorApprovalLinkSchema,
  scheduleWarrantyAppointmentSchema,
  setChecklistItemDoneSchema,
  submitBidSchema,
  submitProposalFeedbackSchema,
  submitSurveyResponseSchema,
  transitionJobStatusSchema,
  updateBillStatusSchema,
  updateLeadStageSchema,
  updateScheduleItemSchema,
  updateTodoStatusSchema,
} from "@/lib/api-schemas";
import { AGENT_DEFAULT_SCOPES, SCOPES } from "@/lib/api-scopes";

/** Convert a Zod schema to a JSON Schema object suitable for embedding in OpenAPI 3.1. */
function schemaOf(schema: z.ZodType): Record<string, unknown> {
  const jsonSchema = z.toJSONSchema(schema, { unrepresentable: "any" }) as Record<string, unknown>;
  delete jsonSchema.$schema;
  return jsonSchema;
}

const ERROR_SCHEMA = {
  type: "object",
  properties: {
    error: {
      type: "object",
      properties: {
        code: { type: "string" },
        message: { type: "string" },
        details: {},
      },
      required: ["code", "message"],
    },
  },
  required: ["error"],
} as const;

interface EndpointDef {
  readonly method: "get" | "post";
  readonly path: string;
  readonly summary: string;
  readonly description?: string;
  readonly tags: readonly string[];
  /**
   * "apiKey" (default): a scoped ApiKey Bearer token — `scopes` names the
   * required ones. "clientPortal"/"vendorPortal": a Client/Vendor Portal
   * session or single-use action token (src/lib/client-portal/auth.ts,
   * src/lib/vendor-portal/auth.ts) — completely separate token namespaces
   * (CLAUDE.md 2.1/2.3), never interchangeable with an ApiKey or each other
   * even though all three travel as `Authorization: Bearer`. `scopes` is
   * ignored for portal endpoints; per-job module gating (ClientJobAccess/
   * VendorJobAccess) isn't a static scope and is documented in `description`.
   * "public": a single-use link token scoped to a standalone no-account
   * table (SubmittalReviewLink/SurveyResponseLink) — not a Client/Vendor at
   * all, so it isn't clientPortal/vendorPortal either; `scopes` is ignored.
   */
  readonly authKind?: "apiKey" | "clientPortal" | "vendorPortal" | "public";
  readonly scopes: readonly string[];
  readonly pathParams?: readonly string[];
  readonly queryParams?: readonly { name: string; description: string; schema?: Record<string, unknown> }[];
  readonly requestSchema?: z.ZodType;
  readonly successStatus?: number;
  readonly successDescription?: string;
}

// Transcribed 1:1 from `withApiAuth([...])` in each route.ts — see the file comment.
const ENDPOINTS: readonly EndpointDef[] = [
  // --- Jobs ---------------------------------------------------------------
  {
    method: "get",
    path: "/jobs",
    summary: "List jobs",
    tags: ["Jobs"],
    scopes: ["jobs:read"],
    queryParams: [
      { name: "status", description: "Filter by JobStatus" },
      { name: "contractType", description: "Filter by ContractType" },
      { name: "jobGroupId", description: "Filter by job group" },
      { name: "includeTemplates", description: "Include template jobs (default false)" },
      { name: "limit", description: "Page size, 1-200 (default 50)" },
      { name: "cursor", description: "Opaque pagination cursor (a job id) from a previous response" },
    ],
  },
  {
    method: "post",
    path: "/jobs",
    summary: "Create a job",
    description: "New jobs always start in PRE_SALE. Use POST /jobs/{jobId}/status to move it through the lifecycle.",
    tags: ["Jobs"],
    scopes: ["jobs:write"],
    requestSchema: createJobSchema,
    successStatus: 201,
  },
  {
    method: "get",
    path: "/jobs/{jobId}",
    summary: "Get a job",
    description: "Includes its status-change history and which statuses it may legally move to next.",
    tags: ["Jobs"],
    scopes: ["jobs:read"],
    pathParams: ["jobId"],
  },
  {
    method: "post",
    path: "/jobs/{jobId}/status",
    summary: "Transition a job's lifecycle status",
    description: "The only way to change Job.status — guarded by the state machine in src/lib/job-status.ts.",
    tags: ["Jobs"],
    scopes: ["jobs:write"],
    pathParams: ["jobId"],
    requestSchema: transitionJobStatusSchema,
  },
  {
    method: "get",
    path: "/jobs/{jobId}/budget",
    summary: "Get a job's commitment funnel",
    description:
      "original -> revised -> pending -> committed -> actual -> projected -> cost-to-complete, plus client pricing and profit.",
    tags: ["Budget"],
    scopes: ["budgets:read"],
    pathParams: ["jobId"],
  },

  // --- Cost codes -----------------------------------------------------------
  {
    method: "get",
    path: "/cost-codes",
    summary: "List the org's cost code catalog",
    tags: ["Cost Codes"],
    scopes: ["cost-codes:read"],
    queryParams: [
      { name: "includeInactive", description: "Include inactive cost codes (default false)" },
      { name: "costType", description: "Filter by CostType" },
    ],
  },
  {
    method: "post",
    path: "/cost-codes",
    summary: "Create a cost code",
    tags: ["Cost Codes"],
    scopes: ["cost-codes:write"],
    requestSchema: createCostCodeSchema,
    successStatus: 201,
  },

  // --- Estimates --------------------------------------------------------
  {
    method: "get",
    path: "/estimates",
    summary: "List estimates",
    tags: ["Estimates"],
    scopes: ["estimates:read"],
    queryParams: [{ name: "jobId", description: "Filter to one job" }],
  },
  {
    method: "post",
    path: "/estimates",
    summary: "Create an estimate",
    tags: ["Estimates"],
    scopes: ["estimates:write"],
    requestSchema: createEstimateSchema,
    successStatus: 201,
  },
  {
    method: "post",
    path: "/estimates/{estimateId}/send-to-budget",
    summary: "Send an estimate to the job's budget",
    description:
      "Locks the estimate and writes its rolled-up per-cost-code totals into the job's Budget. The explicit conversion action — never a background sync.",
    tags: ["Estimates", "Budget"],
    scopes: ["estimates:write"],
    pathParams: ["estimateId"],
    queryParams: [{ name: "allowResend", description: "\"true\" to update a previously-sent estimate's revised figures" }],
  },
  {
    method: "post",
    path: "/estimates/ai-draft",
    summary: "Draft an estimate from field notes with AI",
    description:
      "handoff.ai-style: turns rough field notes into a line-item estimate against the org's real cost code catalog. Always created as a DRAFT for human review — never locked or sent to budget automatically. Returns 503 if ANTHROPIC_API_KEY is not configured.",
    tags: ["Estimates", "AI"],
    scopes: ["estimates:write"],
    requestSchema: aiDraftEstimateSchema,
    successStatus: 201,
  },

  // --- Purchase orders ----------------------------------------------------
  {
    method: "get",
    path: "/purchase-orders",
    summary: "List purchase orders",
    tags: ["Purchase Orders"],
    scopes: ["purchase-orders:read"],
    queryParams: [
      { name: "jobId", description: "Filter to one job" },
      { name: "status", description: "Filter by PurchaseOrderStatus" },
    ],
  },
  {
    method: "post",
    path: "/purchase-orders",
    summary: "Create a purchase order",
    tags: ["Purchase Orders"],
    scopes: ["purchase-orders:write"],
    requestSchema: createPurchaseOrderSchema,
    successStatus: 201,
  },
  {
    method: "post",
    path: "/purchase-orders/{purchaseOrderId}/approve",
    summary: "Approve a purchase order",
    description: "Moves its cost from pendingCost to committedCost in the funnel. Idempotent if already approved.",
    tags: ["Purchase Orders"],
    scopes: ["purchase-orders:write"],
    pathParams: ["purchaseOrderId"],
  },
  {
    method: "post",
    path: "/purchase-orders/match-by-road-name",
    summary: "Match a PO name or transaction description to a job (Duke's matcher)",
    description:
      "Scores active jobs against a road name / house number found in the query string. bestMatch is null when the top two candidates tie — never guesses between two houses on the same street.",
    tags: ["Purchase Orders"],
    scopes: ["jobs:read"],
    requestSchema: matchByRoadNameSchema,
  },

  // --- Bills --------------------------------------------------------------
  {
    method: "get",
    path: "/bills",
    summary: "List bills",
    tags: ["Bills"],
    scopes: ["bills:read"],
    queryParams: [
      { name: "jobId", description: "Filter to one job" },
      { name: "approvalStatus", description: "Filter by BillApprovalStatus" },
    ],
  },
  {
    method: "post",
    path: "/bills",
    summary: "Create a bill",
    description: "Optionally against a purchase order (purchaseOrderId), enabling PO-to-bill reconciliation.",
    tags: ["Bills"],
    scopes: ["bills:write"],
    requestSchema: createBillSchema,
    successStatus: 201,
  },
  {
    method: "post",
    path: "/bills/{billId}/status",
    summary: "Move a bill through AP approval routing",
    description: "IN_REVIEW -> APPROVED -> READY_FOR_PAYMENT -> PAID, with VOID reachable from any unpaid state.",
    tags: ["Bills"],
    scopes: ["bills:write"],
    pathParams: ["billId"],
    requestSchema: updateBillStatusSchema,
  },
  {
    method: "post",
    path: "/bills/ai-ocr",
    summary: "Draft a bill from a photographed/scanned receipt or invoice with AI",
    description:
      "Extracts vendor, date, and line items against the org's real cost code catalog and creates a real Bill (fromOcr: true), starting IN_REVIEW like any other bill — never auto-approved. document.data is base64; mediaType may be an image type or application/pdf. Returns 503 if ANTHROPIC_API_KEY is not configured.",
    tags: ["Bills", "AI"],
    scopes: ["bills:write"],
    requestSchema: aiOcrBillSchema,
    successStatus: 201,
  },

  // --- Invoicing ------------------------------------------------------------
  {
    method: "get",
    path: "/invoices",
    summary: "List invoices",
    tags: ["Invoicing"],
    scopes: ["invoices:read"],
    queryParams: [
      { name: "jobId", description: "Filter to one job" },
      { name: "status", description: "Filter by InvoiceStatus" },
    ],
  },
  {
    method: "post",
    path: "/invoices",
    summary: "Create an invoice",
    description: "FLAT invoices set amountCents directly; LINE_ITEM and PROGRESS invoices require lineItems.",
    tags: ["Invoicing"],
    scopes: ["invoices:write"],
    requestSchema: createInvoiceSchema,
    successStatus: 201,
  },
  {
    method: "post",
    path: "/invoices/{invoiceId}/send",
    summary: "Mark a draft invoice as sent",
    description: "The transition that makes it count toward the budget's amountInvoiced.",
    tags: ["Invoicing"],
    scopes: ["invoices:write"],
    pathParams: ["invoiceId"],
  },
  {
    method: "post",
    path: "/invoices/{invoiceId}/payments",
    summary: "Record a payment against an invoice",
    description: "Rejects any amount that would exceed what's left on the invoice (422 overpayment).",
    tags: ["Invoicing"],
    scopes: ["invoices:write"],
    pathParams: ["invoiceId"],
    requestSchema: recordPaymentSchema,
    successStatus: 201,
  },
  {
    method: "get",
    path: "/draw-schedules",
    summary: "List draw schedules",
    tags: ["Invoicing"],
    scopes: ["invoices:read"],
    queryParams: [{ name: "jobId", description: "Filter to one job" }],
  },
  {
    method: "post",
    path: "/draw-schedules",
    summary: "Create a draw schedule",
    description: "Draw percentages (pctOfContractBasisPoints) must not sum to more than 100%.",
    tags: ["Invoicing"],
    scopes: ["invoices:write"],
    requestSchema: createDrawScheduleSchema,
    successStatus: 201,
  },
  {
    method: "post",
    path: "/draws/{drawId}/generate-invoice",
    summary: "Generate a draw's draft invoice",
    description:
      "Prices the draw from the job's current revised client price and freezes that amount. A draw generates at most one invoice.",
    tags: ["Invoicing"],
    scopes: ["invoices:write"],
    pathParams: ["drawId"],
    successStatus: 201,
  },

  // --- Change Orders ----------------------------------------------------------
  {
    method: "get",
    path: "/change-orders",
    summary: "List change orders",
    tags: ["Change Orders"],
    scopes: ["change-orders:read"],
    queryParams: [
      { name: "jobId", description: "Filter to one job" },
      { name: "status", description: "Filter by ChangeOrderStatus" },
    ],
  },
  {
    method: "post",
    path: "/change-orders",
    summary: "Create a change order",
    description:
      "FLAT mode requires flatCostCodeId/flatCostCents/flatClientPriceCents; ITEMIZED mode requires at least one line item. Starts PENDING — no budget effect until approved.",
    tags: ["Change Orders"],
    scopes: ["change-orders:write"],
    requestSchema: createChangeOrderSchema,
    successStatus: 201,
  },
  {
    method: "post",
    path: "/change-orders/{changeOrderId}/approve",
    summary: "Approve a change order",
    description:
      "The explicit conversion action: applies the CO's cost/price deltas onto the job's Budget and marks it APPROVED. Optionally carries the client's e-signature.",
    tags: ["Change Orders"],
    scopes: ["change-orders:write"],
    pathParams: ["changeOrderId"],
    requestSchema: approveChangeOrderSchema,
  },
  {
    method: "post",
    path: "/change-orders/{changeOrderId}/decline",
    summary: "Decline a change order",
    description: "No budget effect.",
    tags: ["Change Orders"],
    scopes: ["change-orders:write"],
    pathParams: ["changeOrderId"],
  },
  {
    method: "post",
    path: "/change-orders/{changeOrderId}/push-to-purchase-order",
    summary: "Push an approved change order to a Purchase Order",
    description: "Follow-up conversion for an approved CO. Creates a PO tagged sourceType=CHANGE_ORDER, sourceId back to this CO.",
    tags: ["Change Orders"],
    scopes: ["change-orders:write", "purchase-orders:write"],
    pathParams: ["changeOrderId"],
    requestSchema: pushChangeOrderToPurchaseOrderSchema,
    successStatus: 201,
  },

  // --- Time clock -----------------------------------------------------------
  {
    method: "get",
    path: "/time-clock",
    summary: "List time clock entries",
    tags: ["Time Clock"],
    scopes: ["time-clock:read"],
    queryParams: [
      { name: "jobId", description: "Filter to one job" },
      { name: "userId", description: "Filter to one worker" },
      { name: "approvalStatus", description: "PENDING | APPROVED | REJECTED" },
      { name: "limit", description: "Page size, 1-200 (default 50)" },
    ],
  },
  {
    method: "post",
    path: "/time-clock",
    summary: "Clock in",
    description: "Snapshots the labor rate from the cost code's default (or an explicit override) and checks the job's geofence if configured.",
    tags: ["Time Clock"],
    scopes: ["time-clock:write"],
    requestSchema: clockInSchema,
    successStatus: 201,
  },
  {
    method: "post",
    path: "/time-clock/bulk-clock-in",
    summary: "Supervisor bulk clock-in",
    description: "Requires supervisorUserId to belong to an ADMIN or PM. Per-worker failures don't abort the batch.",
    tags: ["Time Clock"],
    scopes: ["time-clock:write"],
    requestSchema: bulkClockInSchema.extend({ supervisorUserId: z.string().cuid() }),
    successDescription: "One result per requested worker, each either { ok: true, entry } or { ok: false, error }.",
  },
  {
    method: "post",
    path: "/time-clock/{entryId}/clock-out",
    summary: "Clock out",
    tags: ["Time Clock"],
    scopes: ["time-clock:write"],
    pathParams: ["entryId"],
    requestSchema: clockOutSchema,
  },
  {
    method: "post",
    path: "/time-clock/{entryId}/breaks/start",
    summary: "Start a break",
    tags: ["Time Clock"],
    scopes: ["time-clock:write"],
    pathParams: ["entryId"],
    successStatus: 201,
  },
  {
    method: "post",
    path: "/time-clock/{entryId}/breaks/end",
    summary: "End the open break",
    tags: ["Time Clock"],
    scopes: ["time-clock:write"],
    pathParams: ["entryId"],
  },
  {
    method: "post",
    path: "/time-clock/{entryId}/approve",
    summary: "Approve a time clock entry",
    description:
      "Requires approverUserId to belong to an ADMIN or PM. Only an approved, clocked-out entry counts as committed labor cost in the funnel.",
    tags: ["Time Clock"],
    scopes: ["time-clock:write"],
    pathParams: ["entryId"],
    requestSchema: z.object({ approverUserId: z.string().cuid() }),
  },
  {
    method: "post",
    path: "/time-clock/{entryId}/reject",
    summary: "Reject a time clock entry",
    tags: ["Time Clock"],
    scopes: ["time-clock:write"],
    pathParams: ["entryId"],
    requestSchema: z.object({ approverUserId: z.string().cuid() }),
  },
  {
    method: "get",
    path: "/time-clock/overtime-summary",
    summary: "Weekly overtime summary for one worker",
    description:
      "Computed across every job and cost code the worker touched that week — overtime is a property of the worker's week, not of any one job.",
    tags: ["Time Clock"],
    scopes: ["time-clock:read"],
    queryParams: [
      { name: "userId", description: "Required" },
      { name: "weekStart", description: "Required, ISO date/time — inclusive start of the 7-day window" },
    ],
  },

  // --- Schedule ---------------------------------------------------------------
  {
    method: "get",
    path: "/schedules",
    summary: "List schedules",
    tags: ["Schedule"],
    scopes: ["schedule:read"],
    queryParams: [{ name: "jobId", description: "Filter to one job" }],
  },
  {
    method: "post",
    path: "/schedules",
    summary: "Create a schedule",
    tags: ["Schedule"],
    scopes: ["schedule:write"],
    requestSchema: createScheduleSchema,
    successStatus: 201,
  },
  {
    method: "get",
    path: "/schedules/{scheduleId}",
    summary: "Get a schedule, computed (CPM)",
    description:
      "Every item's dates and critical-path status are freshly computed, never stored (src/lib/scheduling/cpm.ts).",
    tags: ["Schedule"],
    scopes: ["schedule:read"],
    pathParams: ["scheduleId"],
  },
  {
    method: "post",
    path: "/schedules/{scheduleId}/baseline",
    summary: "Snapshot the current computed dates as the baseline",
    description: "Explicit action, never automatic.",
    tags: ["Schedule"],
    scopes: ["schedule:write"],
    pathParams: ["scheduleId"],
  },
  {
    method: "post",
    path: "/schedules/{scheduleId}/items",
    summary: "Add a schedule item",
    tags: ["Schedule"],
    scopes: ["schedule:write"],
    pathParams: ["scheduleId"],
    requestSchema: createScheduleItemSchema,
    successStatus: 201,
  },
  {
    method: "post",
    path: "/schedule-items/{itemId}",
    summary: "Update a schedule item's mutable fields",
    tags: ["Schedule"],
    scopes: ["schedule:write"],
    pathParams: ["itemId"],
    requestSchema: updateScheduleItemSchema,
  },
  {
    method: "get",
    path: "/non-working-days",
    summary: "List the org-wide holiday/shutdown calendar",
    description: "The days the CPM engine skips when computing schedule dates.",
    tags: ["Schedule"],
    scopes: ["schedule:read"],
  },
  {
    method: "post",
    path: "/non-working-days",
    summary: "Add a non-working day",
    tags: ["Schedule"],
    scopes: ["schedule:write"],
    requestSchema: createNonWorkingDaySchema,
    successStatus: 201,
  },

  // --- Daily Logs -------------------------------------------------------------
  {
    method: "get",
    path: "/daily-logs",
    summary: "List daily logs",
    tags: ["Daily Logs"],
    scopes: ["daily-logs:read"],
    queryParams: [
      { name: "jobId", description: "Filter to one job" },
      { name: "limit", description: "Page size, 1-200 (default 50)" },
    ],
  },
  {
    method: "post",
    path: "/daily-logs",
    summary: "Create a daily log",
    description: "Heather's core surface: notes, media, auto-weather.",
    tags: ["Daily Logs"],
    scopes: ["daily-logs:write"],
    requestSchema: createDailyLogSchema,
    successStatus: 201,
  },

  // --- Todos --------------------------------------------------------------
  {
    method: "get",
    path: "/todos",
    summary: "List todos",
    description: "The generic entity that also covers punch lists.",
    tags: ["Todos"],
    scopes: ["todos:read"],
    queryParams: [
      { name: "jobId", description: "Filter to one job" },
      { name: "status", description: "Filter by TodoStatus" },
      { name: "category", description: "Filter by category" },
    ],
  },
  {
    method: "post",
    path: "/todos",
    summary: "Create a todo",
    description: "Optionally with an ordered list of checklist item titles.",
    tags: ["Todos"],
    scopes: ["todos:write"],
    requestSchema: createTodoSchema,
    successStatus: 201,
  },
  {
    method: "post",
    path: "/todos/{todoId}/status",
    summary: "Update a todo's status",
    tags: ["Todos"],
    scopes: ["todos:write"],
    pathParams: ["todoId"],
    requestSchema: updateTodoStatusSchema,
  },
  {
    method: "post",
    path: "/todos/checklist-items/{checklistItemId}",
    summary: "Mark a checklist item done/not done",
    tags: ["Todos"],
    scopes: ["todos:write"],
    pathParams: ["checklistItemId"],
    requestSchema: setChecklistItemDoneSchema,
  },

  // --- RFIs -----------------------------------------------------------------
  {
    method: "get",
    path: "/rfis",
    summary: "List RFIs",
    tags: ["RFIs"],
    scopes: ["rfis:read"],
    queryParams: [
      { name: "jobId", description: "Filter to one job" },
      { name: "status", description: "Filter by RfiStatus" },
    ],
  },
  {
    method: "post",
    path: "/rfis",
    summary: "Create an RFI",
    tags: ["RFIs"],
    scopes: ["rfis:write"],
    requestSchema: createRfiSchema,
    successStatus: 201,
  },
  {
    method: "post",
    path: "/rfis/{rfiId}/answer",
    summary: "Answer an RFI",
    tags: ["RFIs"],
    scopes: ["rfis:write"],
    pathParams: ["rfiId"],
    requestSchema: answerRfiSchema,
  },
  {
    method: "post",
    path: "/rfis/{rfiId}/close",
    summary: "Close an RFI",
    tags: ["RFIs"],
    scopes: ["rfis:write"],
    pathParams: ["rfiId"],
  },

  // --- Files ------------------------------------------------------------------
  {
    method: "get",
    path: "/files",
    summary: "List file metadata",
    tags: ["Files"],
    scopes: ["files:read"],
    queryParams: [
      { name: "jobId", description: "Filter to one job" },
      { name: "category", description: "Filter by FileCategory" },
    ],
  },
  {
    method: "post",
    path: "/files",
    summary: "Register a file",
    description:
      "Metadata registration only — there is no upload endpoint yet (no S3/R2 credentials configured), so url must already point at a hosted file.",
    tags: ["Files"],
    scopes: ["files:write"],
    requestSchema: registerFileSchema,
    successStatus: 201,
  },

  // --- Comments ---------------------------------------------------------------
  {
    method: "get",
    path: "/comments",
    summary: "List comments on a feature",
    description: "The unified Comment/Activity layer — featureType/featureId identify the commented-on entity.",
    tags: ["Comments"],
    scopes: ["comments:read"],
    queryParams: [
      { name: "featureType", description: "Required. The entity type the comment is attached to." },
      { name: "featureId", description: "Required. The entity id the comment is attached to." },
    ],
  },
  {
    method: "post",
    path: "/comments",
    summary: "Create a comment",
    tags: ["Comments"],
    scopes: ["comments:write"],
    requestSchema: createCommentSchema,
    successStatus: 201,
  },

  // --- Notifications ------------------------------------------------------------
  {
    method: "get",
    path: "/notifications",
    summary: "List a user's notifications",
    tags: ["Notifications"],
    scopes: ["notifications:read"],
    queryParams: [
      { name: "userId", description: "Required" },
      { name: "unreadOnly", description: "\"true\" to only return unread notifications (default false)" },
      { name: "limit", description: "Page size, 1-200 (default 50)" },
    ],
  },
  {
    method: "post",
    path: "/notifications/{notificationId}/read",
    summary: "Mark a notification read",
    tags: ["Notifications"],
    scopes: ["notifications:write"],
    pathParams: ["notificationId"],
  },

  // --- Webhooks & events ----------------------------------------------------
  {
    method: "get",
    path: "/webhooks",
    summary: "List webhook subscriptions",
    tags: ["Webhooks"],
    scopes: ["webhooks:read"],
  },
  {
    method: "post",
    path: "/webhooks",
    summary: "Create a webhook subscription",
    description: "The response's secret is shown exactly once — it signs delivery payloads as sha256(timestamp + \".\" + body).",
    tags: ["Webhooks"],
    scopes: ["webhooks:write"],
    requestSchema: createWebhookSubscriptionSchema,
    successStatus: 201,
  },
  {
    method: "post",
    path: "/events",
    summary: "Raise a custom domain event",
    description:
      "For events with no dedicated action, e.g. bill.unmatched_transaction (Duke) or permit.milestone_reached (Heather).",
    tags: ["Webhooks"],
    scopes: ["events:write"],
    requestSchema: emitEventSchema,
    successStatus: 202,
  },

  // --- Reports --------------------------------------------------------------
  {
    method: "get",
    path: "/reports/wip",
    summary: "Work In Progress report",
    description: "Percent complete, earned revenue, and over/under-billing, per active job.",
    tags: ["Reports"],
    scopes: ["reports:read"],
  },
  {
    method: "get",
    path: "/reports/budgeted-vs-projected",
    summary: "Budgeted vs Projected report",
    tags: ["Reports"],
    scopes: ["reports:read"],
  },
  {
    method: "get",
    path: "/reports/profitability",
    summary: "Profitability report",
    description: "Sorted worst-margin-first.",
    tags: ["Reports"],
    scopes: ["reports:read"],
  },
  {
    method: "get",
    path: "/reports/invoicing",
    summary: "Invoicing report",
    tags: ["Reports"],
    scopes: ["reports:read"],
  },
  {
    method: "get",
    path: "/reports/labor",
    summary: "Labor Actuals vs Budgeted report",
    description: "\"Actuals\" here means approved timesheet cost — there is no payroll/Gusto sync yet to confirm what was actually paid.",
    tags: ["Reports"],
    scopes: ["reports:read"],
  },
  {
    method: "get",
    path: "/reports/cash-flow",
    summary: "Cash Flow report",
    description: "Rolling window of historical cash in/out plus a forward projection from remainingToInvoice and costToComplete.",
    tags: ["Reports"],
    scopes: ["reports:read"],
    queryParams: [{ name: "windowDays", description: "1-365, default 30" }],
  },

  // --- Client Portal management (staff/agent side, apiKey-authed) ----------
  {
    method: "get",
    path: "/clients",
    summary: "List clients",
    tags: ["Client Portal"],
    scopes: ["clients:read"],
    queryParams: [{ name: "jobId", description: "Filter to clients with access to one job" }],
  },
  {
    method: "post",
    path: "/clients",
    summary: "Create a client",
    tags: ["Client Portal"],
    scopes: ["clients:write"],
    requestSchema: createClientSchema,
    successStatus: 201,
  },
  {
    method: "post",
    path: "/clients/{clientId}/job-access",
    summary: "Grant/update a client's per-job portal module visibility",
    description: "Upsert — re-running this to flip one flag (e.g. canViewBudget) doesn't need a separate update endpoint.",
    tags: ["Client Portal"],
    scopes: ["clients:write"],
    pathParams: ["clientId"],
    requestSchema: grantJobAccessSchema,
    successStatus: 201,
  },
  {
    method: "post",
    path: "/clients/{clientId}/portal-invite",
    summary: "Issue a one-time portal login link",
    description:
      "Returns the raw token exactly once, same convention as ApiKey issuance — WCI OS has no email provider wired up " +
      "yet, so the caller is responsible for getting it to the client.",
    tags: ["Client Portal"],
    scopes: ["clients:write"],
    pathParams: ["clientId"],
    successStatus: 201,
  },
  {
    method: "get",
    path: "/allowances",
    summary: "List Allowances",
    tags: ["Selections"],
    scopes: ["selections:read"],
    queryParams: [{ name: "jobId", description: "Filter to one job" }],
  },
  {
    method: "post",
    path: "/allowances",
    summary: "Create an Allowance",
    description: "A budget placeholder booked against a CostCode, for a Selection's Options to be priced against.",
    tags: ["Selections"],
    scopes: ["selections:write"],
    requestSchema: createAllowanceSchema,
    successStatus: 201,
  },
  {
    method: "get",
    path: "/selections",
    summary: "List Selections (with their Options)",
    tags: ["Selections"],
    scopes: ["selections:read"],
    queryParams: [{ name: "jobId", description: "Filter to one job" }],
  },
  {
    method: "post",
    path: "/selections",
    summary: "Create a Selection with its Options",
    tags: ["Selections"],
    scopes: ["selections:write"],
    requestSchema: createSelectionSchema,
    successStatus: 201,
  },
  {
    method: "post",
    path: "/change-orders/{changeOrderId}/approval-link",
    summary: "Issue a headless approval link for a Change Order",
    description: "Single-use, scoped to exactly this change order. See POST /portal/change-orders/{changeOrderId}/approve.",
    tags: ["Client Portal"],
    scopes: ["change-orders:write"],
    pathParams: ["changeOrderId"],
    requestSchema: requestApprovalLinkSchema,
    successStatus: 201,
  },
  {
    method: "post",
    path: "/selections/{selectionId}/options/{optionId}/approval-link",
    summary: "Issue a headless approval link for a Selection Option",
    description:
      "Single-use, scoped to exactly this option. Approving it settles the whole Selection (siblings are DECLINED).",
    tags: ["Client Portal"],
    scopes: ["selections:write"],
    pathParams: ["selectionId", "optionId"],
    requestSchema: requestApprovalLinkSchema,
    successStatus: 201,
  },

  // --- Client Portal (client-authed: ClientSession or a one-time token) ----
  {
    method: "post",
    path: "/portal/login",
    summary: "Exchange a portal login/invite token for a session",
    description:
      "The token travels as the Authorization: Bearer header, not the JSON body, so the one rule at src/proxy.ts " +
      '("every /api/v1/* call needs an Authorization or x-api-key header") holds for every portal call too.',
    tags: ["Client Portal"],
    authKind: "clientPortal",
    scopes: [],
  },
  {
    method: "get",
    path: "/portal/jobs",
    summary: "List jobs this client has portal access to",
    tags: ["Client Portal"],
    authKind: "clientPortal",
    scopes: [],
  },
  {
    method: "get",
    path: "/portal/jobs/{jobId}/daily-logs",
    summary: "Client-visible daily logs for a job",
    tags: ["Client Portal"],
    authKind: "clientPortal",
    scopes: [],
    pathParams: ["jobId"],
  },
  {
    method: "get",
    path: "/portal/jobs/{jobId}/schedule",
    summary: "Client-visible schedule for a job, computed (CPM)",
    tags: ["Client Portal"],
    authKind: "clientPortal",
    scopes: [],
    pathParams: ["jobId"],
  },
  {
    method: "get",
    path: "/portal/jobs/{jobId}/documents",
    summary: "Client-visible files for a job",
    tags: ["Client Portal"],
    authKind: "clientPortal",
    scopes: [],
    pathParams: ["jobId"],
  },
  {
    method: "get",
    path: "/portal/jobs/{jobId}/invoices",
    summary: "Invoices for a job, with payment history",
    tags: ["Client Portal"],
    authKind: "clientPortal",
    scopes: [],
    pathParams: ["jobId"],
  },
  {
    method: "get",
    path: "/portal/jobs/{jobId}/change-orders",
    summary: "Change orders for a job",
    tags: ["Client Portal"],
    authKind: "clientPortal",
    scopes: [],
    pathParams: ["jobId"],
  },
  {
    method: "get",
    path: "/portal/jobs/{jobId}/selections",
    summary: "Selections (with Options) for a job",
    tags: ["Client Portal"],
    authKind: "clientPortal",
    scopes: [],
    pathParams: ["jobId"],
  },
  {
    method: "get",
    path: "/portal/jobs/{jobId}/budget",
    summary: "Client pricing view of a job's budget",
    description:
      "Client price only — never cost or profit. Gated by ClientJobAccess.canViewBudget, off by default (CLAUDE.md 3).",
    tags: ["Client Portal"],
    authKind: "clientPortal",
    scopes: [],
    pathParams: ["jobId"],
  },
  {
    method: "post",
    path: "/portal/change-orders/{changeOrderId}/approve",
    summary: "Approve a Change Order as the client",
    description:
      "Works with either a portal session (gated by ClientJobAccess.canApproveChangeOrders) or a single-use " +
      "CHANGE_ORDER_APPROVAL token from POST /change-orders/{id}/approval-link — the headless, no-login path.",
    tags: ["Client Portal"],
    authKind: "clientPortal",
    scopes: [],
    pathParams: ["changeOrderId"],
    requestSchema: portalApproveChangeOrderSchema,
  },
  {
    method: "post",
    path: "/portal/selections/{selectionId}/options/{optionId}/approve",
    summary: "Approve a Selection Option as the client",
    description:
      "Works with either a portal session (gated by ClientJobAccess.canApproveSelections) or a single-use " +
      "SELECTION_APPROVAL token from POST /selections/{id}/options/{id}/approval-link.",
    tags: ["Client Portal"],
    authKind: "clientPortal",
    scopes: [],
    pathParams: ["selectionId", "optionId"],
  },
  {
    method: "post",
    path: "/portal/invoices/{invoiceId}/pay",
    summary: "Create a Stripe PaymentIntent for an invoice's remaining balance",
    description:
      "Gated by ClientJobAccess.canMakePayments. Returns 503 if STRIPE_SECRET_KEY is unconfigured — never a " +
      "fabricated payment. The Payment row itself is written by POST /webhooks/stripe once Stripe confirms the charge.",
    tags: ["Client Portal"],
    authKind: "clientPortal",
    scopes: [],
    pathParams: ["invoiceId"],
  },

  // --- Sub/Vendor Portal management (staff/agent side, apiKey-authed) ------
  {
    method: "get",
    path: "/vendors",
    summary: "List vendors",
    tags: ["Vendor Portal"],
    scopes: ["vendors:read"],
    queryParams: [{ name: "jobId", description: "Filter to vendors with access to one job" }],
  },
  {
    method: "post",
    path: "/vendors",
    summary: "Create a vendor",
    tags: ["Vendor Portal"],
    scopes: ["vendors:write"],
    requestSchema: createVendorSchema,
    successStatus: 201,
  },
  {
    method: "post",
    path: "/vendors/{vendorId}/job-access",
    summary: "Grant/update a vendor's per-job portal module visibility",
    tags: ["Vendor Portal"],
    scopes: ["vendors:write"],
    pathParams: ["vendorId"],
    requestSchema: grantVendorJobAccessSchema,
    successStatus: 201,
  },
  {
    method: "post",
    path: "/vendors/{vendorId}/portal-invite",
    summary: "Issue a one-time portal login link",
    tags: ["Vendor Portal"],
    scopes: ["vendors:write"],
    pathParams: ["vendorId"],
    successStatus: 201,
  },
  {
    method: "get",
    path: "/vendors/{vendorId}/certifications",
    summary: "List a vendor's certifications",
    tags: ["Vendor Portal"],
    scopes: ["vendors:read"],
    pathParams: ["vendorId"],
  },
  {
    method: "post",
    path: "/vendors/{vendorId}/certifications",
    summary: "Add a certification/insurance record",
    tags: ["Vendor Portal"],
    scopes: ["vendors:write"],
    pathParams: ["vendorId"],
    requestSchema: addCertificationSchema,
    successStatus: 201,
  },
  {
    method: "get",
    path: "/certifications/expiring",
    summary: "Certifications/insurance expiring soon, across every vendor",
    description: "No reminder delivery yet — this is the query a scheduled job will eventually poll (CLAUDE.md 7).",
    tags: ["Vendor Portal"],
    scopes: ["vendors:read"],
    queryParams: [{ name: "withinDays", description: "1-365, default 30" }],
  },
  {
    method: "post",
    path: "/purchase-orders/{purchaseOrderId}/approval-link",
    summary: "Issue a headless PO acceptance link for a vendor",
    description: "Single-use, scoped to exactly this PO. See POST /vendor-portal/purchase-orders/{purchaseOrderId}/accept.",
    tags: ["Vendor Portal"],
    scopes: ["purchase-orders:write"],
    pathParams: ["purchaseOrderId"],
    requestSchema: requestVendorApprovalLinkSchema,
    successStatus: 201,
  },
  {
    method: "get",
    path: "/bid-packages",
    summary: "List bid packages",
    tags: ["Bid Board"],
    scopes: ["bids:read"],
    queryParams: [
      { name: "jobId", description: "Filter to one job" },
      { name: "status", description: "Filter by BidPackageStatus" },
    ],
  },
  {
    method: "post",
    path: "/bid-packages",
    summary: "Create a bid package (with line items)",
    tags: ["Bid Board"],
    scopes: ["bids:write"],
    requestSchema: createBidPackageSchema,
    successStatus: 201,
  },
  {
    method: "post",
    path: "/bid-packages/{bidPackageId}/invite",
    summary: "Invite a vendor to bid",
    description: "Creates the BidSubmission row in INVITED status. Not gated by VendorJobAccess (CLAUDE.md 3).",
    tags: ["Bid Board"],
    scopes: ["bids:write"],
    pathParams: ["bidPackageId"],
    requestSchema: inviteVendorToBidSchema,
    successStatus: 201,
  },
  {
    method: "post",
    path: "/bid-packages/{bidPackageId}/close",
    summary: "Close or award a bid package",
    description: "AWARDED requires at least one ACCEPTED submission — a package can have more than one (split scope).",
    tags: ["Bid Board"],
    scopes: ["bids:write"],
    pathParams: ["bidPackageId"],
    requestSchema: closeBidPackageSchema,
  },
  {
    method: "post",
    path: "/bid-submissions/{bidSubmissionId}/submit",
    summary: "Submit or edit a bid on the vendor's behalf",
    description: "Staff/agent \"builder-edit-on-behalf\" (CLAUDE.md 3), e.g. transcribing a phone bid.",
    tags: ["Bid Board"],
    scopes: ["bids:write"],
    pathParams: ["bidSubmissionId"],
    requestSchema: submitBidSchema,
  },
  {
    method: "post",
    path: "/bid-submissions/{bidSubmissionId}/lock",
    summary: "Freeze a bid submission against further edits",
    tags: ["Bid Board"],
    scopes: ["bids:write"],
    pathParams: ["bidSubmissionId"],
  },
  {
    method: "post",
    path: "/bid-submissions/{bidSubmissionId}/accept",
    summary: "Accept (award) a bid submission",
    tags: ["Bid Board"],
    scopes: ["bids:write"],
    pathParams: ["bidSubmissionId"],
  },
  {
    method: "post",
    path: "/bid-submissions/{bidSubmissionId}/decline",
    summary: "Decline a bid submission",
    tags: ["Bid Board"],
    scopes: ["bids:write"],
    pathParams: ["bidSubmissionId"],
  },
  {
    method: "post",
    path: "/bid-submissions/{bidSubmissionId}/push-to-purchase-order",
    summary: "Push an accepted bid submission to a Purchase Order",
    description: "Explicit conversion action (CLAUDE.md 2.3: Bid -> PO), same pattern as Change Order -> PO.",
    tags: ["Bid Board"],
    scopes: ["bids:write", "purchase-orders:write"],
    pathParams: ["bidSubmissionId"],
    requestSchema: pushBidToPurchaseOrderSchema,
    successStatus: 201,
  },

  // --- Vendor Portal (vendor-authed: VendorSession or a one-time token) ----
  {
    method: "post",
    path: "/vendor-portal/login",
    summary: "Exchange a portal login/invite token for a session",
    tags: ["Vendor Portal"],
    authKind: "vendorPortal",
    scopes: [],
  },
  {
    method: "get",
    path: "/vendor-portal/jobs",
    summary: "List jobs this vendor has portal access to",
    tags: ["Vendor Portal"],
    authKind: "vendorPortal",
    scopes: [],
  },
  {
    method: "get",
    path: "/vendor-portal/jobs/{jobId}/schedule",
    summary: "Sub-visible schedule for a job, computed (CPM)",
    description:
      "VendorJobAccess.scheduleScope is not yet enforced here (CLAUDE.md 7) — every subVisible item is returned.",
    tags: ["Vendor Portal"],
    authKind: "vendorPortal",
    scopes: [],
    pathParams: ["jobId"],
  },
  {
    method: "get",
    path: "/vendor-portal/jobs/{jobId}/documents",
    summary: "Sub-visible files for a job",
    tags: ["Vendor Portal"],
    authKind: "vendorPortal",
    scopes: [],
    pathParams: ["jobId"],
  },
  {
    method: "get",
    path: "/vendor-portal/jobs/{jobId}/purchase-orders",
    summary: "This vendor's own purchase orders on the job",
    tags: ["Vendor Portal"],
    authKind: "vendorPortal",
    scopes: [],
    pathParams: ["jobId"],
  },
  {
    method: "get",
    path: "/vendor-portal/jobs/{jobId}/bills",
    summary: "This vendor's own bills on the job",
    tags: ["Vendor Portal"],
    authKind: "vendorPortal",
    scopes: [],
    pathParams: ["jobId"],
  },
  {
    method: "post",
    path: "/vendor-portal/jobs/{jobId}/bills",
    summary: "Upload an invoice, extracted by AI into a Bill on this job",
    description:
      "Same AI OCR pipeline as staff-facing POST /bills/ai-ocr (src/lib/ai/bill-ocr-service.ts) — the vendor " +
      "never needs to know this organization's cost code catalog. vendorId is pinned to the authenticated " +
      "vendor. The created Bill starts fromOcr: true and IN_REVIEW, so it enters the Budget through the same " +
      "human-approval path as any other bill.",
    tags: ["Vendor Portal"],
    authKind: "vendorPortal",
    scopes: [],
    pathParams: ["jobId"],
    requestSchema: portalUploadBillSchema,
  },
  {
    method: "post",
    path: "/vendor-portal/purchase-orders/{purchaseOrderId}/accept",
    summary: "Accept (e-sign) a Purchase Order as the vendor",
    description:
      "Works with either a portal session or a single-use PO_ACCEPTANCE token from " +
      "POST /purchase-orders/{id}/approval-link — the headless, no-login path.",
    tags: ["Vendor Portal"],
    authKind: "vendorPortal",
    scopes: [],
    pathParams: ["purchaseOrderId"],
    requestSchema: portalAcceptPurchaseOrderSchema,
  },
  {
    method: "get",
    path: "/vendor-portal/bid-packages",
    summary: "Bid packages this vendor has been invited to",
    description: "Not gated by VendorJobAccess — bid participation is independent of job access (CLAUDE.md 3).",
    tags: ["Vendor Portal"],
    authKind: "vendorPortal",
    scopes: [],
  },
  {
    method: "post",
    path: "/vendor-portal/bid-submissions/{bidSubmissionId}/submit",
    summary: "Submit or edit this vendor's own bid",
    tags: ["Vendor Portal"],
    authKind: "vendorPortal",
    scopes: [],
    pathParams: ["bidSubmissionId"],
    requestSchema: submitBidSchema,
  },

  // --- CRM/Sales (apiKey-authed) --------------------------------------------
  {
    method: "get",
    path: "/leads",
    summary: "List leads",
    tags: ["CRM"],
    scopes: ["leads:read"],
    queryParams: [
      { name: "stage", description: "Filter by LeadStage" },
      { name: "assignedUserId", description: "Filter to one assignee" },
    ],
  },
  {
    method: "post",
    path: "/leads",
    summary: "Create a lead",
    tags: ["CRM"],
    scopes: ["leads:write"],
    requestSchema: createLeadSchema,
    successStatus: 201,
  },
  {
    method: "post",
    path: "/leads/{leadId}/stage",
    summary: "Move a lead through the CRM pipeline",
    tags: ["CRM"],
    scopes: ["leads:write"],
    pathParams: ["leadId"],
    requestSchema: updateLeadStageSchema,
  },
  {
    method: "post",
    path: "/leads/{leadId}/convert-to-job",
    summary: "Convert a lead into a real Job (PRE_SALE)",
    description:
      "Explicit conversion action (CLAUDE.md 2.3) — the only entity that legitimately predates a Job. " +
      "Same request shape as POST /jobs; a lead converts to at most one job.",
    tags: ["CRM"],
    scopes: ["leads:write", "jobs:write"],
    pathParams: ["leadId"],
    requestSchema: convertLeadToJobSchema,
    successStatus: 201,
  },
  {
    method: "get",
    path: "/proposals",
    summary: "List proposals",
    tags: ["CRM"],
    scopes: ["proposals:read"],
    queryParams: [
      { name: "jobId", description: "Filter to one job" },
      { name: "status", description: "Filter by ProposalStatus" },
    ],
  },
  {
    method: "post",
    path: "/proposals",
    summary: "Create a proposal — 1-5 priced options for client-side comparison",
    description:
      "Each option wraps its own Estimate (task #116's Good/Better/Best support). A single-option proposal " +
      "auto-selects it, so acceptance behaves exactly like the old single-estimate flow.",
    tags: ["CRM"],
    scopes: ["proposals:write"],
    requestSchema: createProposalSchema,
    successStatus: 201,
  },
  {
    method: "post",
    path: "/proposals/{proposalId}/send",
    summary: "Mark a proposal SENT",
    tags: ["CRM"],
    scopes: ["proposals:write"],
    pathParams: ["proposalId"],
  },
  {
    method: "post",
    path: "/proposals/{proposalId}/decline",
    summary: "Record a staff-observed decline (e.g. a verbal no)",
    tags: ["CRM"],
    scopes: ["proposals:write"],
    pathParams: ["proposalId"],
  },
  {
    method: "post",
    path: "/proposals/{proposalId}/approval-link",
    summary: "Issue a headless e-sign link for the client",
    description: "Single-use, scoped to exactly this proposal. See POST /portal/proposals/{proposalId}/accept.",
    tags: ["CRM"],
    scopes: ["proposals:write"],
    pathParams: ["proposalId"],
    requestSchema: requestApprovalLinkSchema,
    successStatus: 201,
  },

  // --- Client Portal: proposal acceptance -----------------------------------
  {
    method: "post",
    path: "/portal/proposals/{proposalId}/accept",
    summary: "Accept a Proposal as the client",
    description:
      "Works with either a portal session or a single-use PROPOSAL_ACCEPTANCE token from " +
      "POST /proposals/{id}/approval-link. optionId picks which of the proposal's options won — required " +
      "when more than one exists and none has been chosen yet, ignored on a single-option proposal (it's " +
      "already auto-selected). Accepting chains three already-existing actions: e-signs the proposal, moves " +
      "the Job from PRE_SALE to OPEN, and sends the chosen option's Estimate to the Budget. Not gated by " +
      "ClientJobAccess — at PRE_SALE the client typically has no job access yet.",
    tags: ["CRM", "Client Portal"],
    authKind: "clientPortal",
    scopes: [],
    pathParams: ["proposalId"],
    requestSchema: portalAcceptProposalSchema,
  },
  {
    method: "post",
    path: "/portal/proposals/{proposalId}/feedback",
    summary: "Leave free-text feedback on a Proposal as the client",
    description:
      "Same dual-auth as accept, but the token path only validates the link — it does not consume it, so a " +
      "client can leave feedback and still accept later with the same link. Only valid while SENT.",
    tags: ["CRM", "Client Portal"],
    authKind: "clientPortal",
    scopes: [],
    pathParams: ["proposalId"],
    requestSchema: submitProposalFeedbackSchema,
  },

  // --- Specifications --------------------------------------------------------
  {
    method: "get",
    path: "/specifications",
    summary: "List Specifications",
    description: "Optionally filter by jobId. Includes ordered sections.",
    tags: ["Specifications"],
    scopes: ["specifications:read"],
    queryParams: [{ name: "jobId", description: "Filter to one job." }],
  },
  {
    method: "post",
    path: "/specifications",
    summary: "Create a Specification manually",
    description: "Provide sections directly, or use POST /specifications/generate-from-estimate instead.",
    tags: ["Specifications"],
    scopes: ["specifications:write"],
    requestSchema: createSpecificationSchema,
    successStatus: 201,
  },
  {
    method: "post",
    path: "/specifications/generate-from-estimate",
    summary: "Auto-generate a Specification from an Estimate",
    description:
      "Groups the Estimate's line items by their groupLabel (room/assembly tag, defaulting to \"General\") into " +
      "one SpecificationSection per group, with a bulleted body of each line item's title/description.",
    tags: ["Specifications"],
    scopes: ["specifications:write"],
    requestSchema: generateSpecificationFromEstimateSchema,
    successStatus: 201,
  },

  // --- Submittals --------------------------------------------------------
  {
    method: "get",
    path: "/submittals",
    summary: "List Submittals",
    description: "Optionally filter by jobId and/or status. Includes revisions ordered newest-first.",
    tags: ["Submittals"],
    scopes: ["submittals:read"],
    queryParams: [
      { name: "jobId", description: "Filter to one job." },
      { name: "status", description: "Filter to one SubmittalStatus." },
    ],
  },
  {
    method: "post",
    path: "/submittals",
    summary: "Create a Submittal",
    description: "Creates the Submittal with its first revision (revisionNumber 1).",
    tags: ["Submittals"],
    scopes: ["submittals:write"],
    requestSchema: createSubmittalSchema,
    successStatus: 201,
  },
  {
    method: "post",
    path: "/submittals/{submittalId}/revisions",
    summary: "Add a Submittal revision",
    description: "Appends the next sequential revisionNumber and resets status to PENDING.",
    tags: ["Submittals"],
    scopes: ["submittals:write"],
    pathParams: ["submittalId"],
    requestSchema: addSubmittalRevisionSchema,
    successStatus: 201,
  },
  {
    method: "post",
    path: "/submittals/{submittalId}/review-link",
    summary: "Issue a headless review link for an external reviewer (architect/engineer)",
    description:
      "Single-use, scoped to exactly this submittal. The reviewer has no Client/Vendor account — this issues a " +
      "standalone SubmittalReviewLink token, not a clientPortal/vendorPortal one. See POST /submittal-reviews.",
    tags: ["Submittals"],
    scopes: ["submittals:write"],
    pathParams: ["submittalId"],
    requestSchema: issueSubmittalReviewLinkSchema,
    successStatus: 201,
  },
  {
    method: "post",
    path: "/submittal-reviews",
    summary: "Record an external reviewer's decision (no account)",
    description:
      "The review-link token travels as Authorization: Bearer (same convention as every other bearer token in " +
      "this API, so src/proxy.ts's single coarse auth-header rule stays universally true). Single-use — a second " +
      "call with the same token returns 401.",
    tags: ["Submittals"],
    authKind: "public",
    scopes: [],
    requestSchema: recordSubmittalReviewSchema,
  },

  // --- Warranty ------------------------------------------------------------
  {
    method: "get",
    path: "/warranty-claims",
    summary: "List Warranty claims",
    description: "Optionally filter by jobId and/or status.",
    tags: ["Warranty"],
    scopes: ["warranty:read"],
    queryParams: [
      { name: "jobId", description: "Filter to one job." },
      { name: "status", description: "Filter to one WarrantyClaimStatus." },
    ],
  },
  {
    method: "post",
    path: "/warranty-claims",
    summary: "Create a Warranty claim",
    description: "Starts in SUBMITTED. Optionally links a Client (for later client-acceptance headless links).",
    tags: ["Warranty"],
    scopes: ["warranty:write"],
    requestSchema: createWarrantyClaimSchema,
    successStatus: 201,
  },
  {
    method: "post",
    path: "/warranty-claims/{claimId}/schedule",
    summary: "Schedule a Warranty claim's repair appointment",
    description: "Sets appointmentAt and assignedVendorId, moves status to SCHEDULED.",
    tags: ["Warranty"],
    scopes: ["warranty:write"],
    pathParams: ["claimId"],
    requestSchema: scheduleWarrantyAppointmentSchema,
  },
  {
    method: "post",
    path: "/warranty-claims/{claimId}/trade-approval-link",
    summary: "Issue a headless link for the assigned trade to confirm work is done",
    description:
      "Single-use, scoped to exactly this claim and the assigned vendor. See " +
      "POST /vendor-portal/warranty-claims/{claimId}/accept-trade.",
    tags: ["Warranty"],
    scopes: ["warranty:write"],
    pathParams: ["claimId"],
    requestSchema: requestVendorApprovalLinkSchema,
    successStatus: 201,
  },
  {
    method: "post",
    path: "/warranty-claims/{claimId}/client-approval-link",
    summary: "Issue a headless link for the client to confirm they're satisfied",
    description:
      "Single-use, scoped to exactly this claim and client. See POST /portal/warranty-claims/{claimId}/accept-client.",
    tags: ["Warranty"],
    scopes: ["warranty:write"],
    pathParams: ["claimId"],
    requestSchema: requestApprovalLinkSchema,
    successStatus: 201,
  },
  {
    method: "post",
    path: "/vendor-portal/warranty-claims/{claimId}/accept-trade",
    summary: "Confirm warranty work is done, as the assigned trade",
    description:
      "Works with either a portal session or a single-use WARRANTY_TRADE_ACCEPTANCE token from " +
      "POST /warranty-claims/{id}/trade-approval-link. Rejects (403) a vendor session that isn't the claim's " +
      "assignedVendorId. Status becomes IN_PROGRESS if only the trade has accepted so far, or COMPLETED once the " +
      "client has accepted too.",
    tags: ["Warranty", "Vendor Portal"],
    authKind: "vendorPortal",
    scopes: [],
    pathParams: ["claimId"],
    requestSchema: portalAcceptWarrantyWorkSchema,
  },
  {
    method: "post",
    path: "/portal/warranty-claims/{claimId}/accept-client",
    summary: "Confirm satisfaction with warranty work, as the client",
    description:
      "Works with either a portal session or a single-use WARRANTY_CLIENT_ACCEPTANCE token from " +
      "POST /warranty-claims/{id}/client-approval-link. Status becomes COMPLETED once the trade has accepted too, " +
      "otherwise stays at its current status.",
    tags: ["Warranty", "Client Portal"],
    authKind: "clientPortal",
    scopes: [],
    pathParams: ["claimId"],
    requestSchema: portalAcceptWarrantyWorkSchema,
  },

  // --- Surveys ---------------------------------------------------------------
  {
    method: "get",
    path: "/surveys",
    summary: "List Surveys",
    description: "Optionally filter by jobId and/or touchpoint. Includes ordered questions.",
    tags: ["Surveys"],
    scopes: ["surveys:read"],
    queryParams: [
      { name: "jobId", description: "Filter to one job." },
      { name: "touchpoint", description: "Filter to one SurveyTouchpoint." },
    ],
  },
  {
    method: "post",
    path: "/surveys",
    summary: "Create a Survey",
    description: "Creates the Survey with its questions in the given order.",
    tags: ["Surveys"],
    scopes: ["surveys:write"],
    requestSchema: createSurveySchema,
    successStatus: 201,
  },
  {
    method: "post",
    path: "/surveys/{surveyId}/response-link",
    summary: "Issue a headless response link for a recipient (no account)",
    description:
      "Single-use, scoped to exactly this survey. Issues a standalone SurveyResponseLink token, not a " +
      "clientPortal/vendorPortal one — the recipient may not even be a known Client/Vendor. See POST /survey-responses.",
    tags: ["Surveys"],
    scopes: ["surveys:write"],
    pathParams: ["surveyId"],
    requestSchema: issueSurveyResponseLinkSchema,
    successStatus: 201,
  },
  {
    method: "post",
    path: "/survey-responses",
    summary: "Submit survey answers (no account)",
    description:
      "The response-link token travels as Authorization: Bearer, same convention as /submittal-reviews. " +
      "Single-use — a second call with the same token returns 401. `answers` keys are SurveyQuestion ids.",
    tags: ["Surveys"],
    authKind: "public",
    scopes: [],
    requestSchema: submitSurveyResponseSchema,
  },

  // --- AI layer (Phase 8) -----------------------------------------------------
  {
    method: "get",
    path: "/weekly-summaries",
    summary: "List AI weekly client-update digests",
    description: "Optionally filter by jobId.",
    tags: ["AI"],
    scopes: ["weekly-summaries:read"],
    queryParams: [{ name: "jobId", description: "Filter to one job." }],
  },
  {
    method: "post",
    path: "/weekly-summaries",
    summary: "Generate a weekly client-update digest with AI",
    description:
      "Built ONLY from DailyLogs/ScheduleItems already flagged clientVisible — never budget, cost, or profit data, " +
      "regardless of what's true for the job. periodStart/periodEnd default to the last 7 days. Returns 503 if " +
      "ANTHROPIC_API_KEY is not configured.",
    tags: ["AI", "Client Portal"],
    scopes: ["weekly-summaries:write"],
    requestSchema: generateWeeklySummarySchema,
    successStatus: 201,
  },
  {
    method: "get",
    path: "/portal/jobs/{jobId}/weekly-summaries",
    summary: "List this client's weekly-update digests",
    description: "Gated by ClientJobAccess.canViewDailyLogs, reused rather than a new per-entity flag.",
    tags: ["AI", "Client Portal"],
    authKind: "clientPortal",
    scopes: [],
    pathParams: ["jobId"],
  },
  {
    method: "post",
    path: "/jobs/{jobId}/ai-summary",
    summary: "Get a free-text AI status summary of a job, for staff/agents",
    description:
      "Unlike the weekly client digest, this includes real cost/profit figures — it is for staff/agents (Jarvis, " +
      "Hank, ...), never a client. Not persisted: a point-in-time read meant for a chat reply or Slack message. " +
      "Scoped under jobs:read since it's fundamentally a read of data already readable individually. Returns 503 " +
      "if ANTHROPIC_API_KEY is not configured.",
    tags: ["AI"],
    scopes: ["jobs:read"],
    pathParams: ["jobId"],
  },
];

function toOperation(endpoint: EndpointDef): Record<string, unknown> {
  const parameters = [
    ...(endpoint.pathParams ?? []).map((name) => ({
      name,
      in: "path",
      required: true,
      schema: { type: "string" },
    })),
    ...(endpoint.queryParams ?? []).map((param) => ({
      name: param.name,
      in: "query",
      required: false,
      description: param.description,
      schema: param.schema ?? { type: "string" },
    })),
  ];

  const authKind = endpoint.authKind ?? "apiKey";
  const isPortal = authKind === "clientPortal" || authKind === "vendorPortal";
  const isPublic = authKind === "public";

  const responses: Record<string, unknown> = {
    [String(endpoint.successStatus ?? 200)]: {
      description: endpoint.successDescription ?? "Success. See CLAUDE.md and the route source for the exact response shape.",
    },
    "401": {
      description: isPublic
        ? "Missing, invalid, or already-used single-use link token."
        : isPortal
          ? "Missing or invalid portal session/action token."
          : "Missing or invalid API key.",
      content: jsonContent(ERROR_SCHEMA),
    },
  };
  if (!isPublic) {
    responses["403"] = {
      description: isPortal
        ? `The ${authKind === "clientPortal" ? "client" : "vendor"} has access to the job but not this module (${authKind === "clientPortal" ? "ClientJobAccess" : "VendorJobAccess"}).`
        : "The API key lacks a required scope.",
      content: jsonContent(ERROR_SCHEMA),
    };
  }
  if (endpoint.requestSchema) {
    responses["422"] = { description: "Validation failed.", content: jsonContent(ERROR_SCHEMA) };
  }

  return {
    summary: endpoint.summary,
    description: endpoint.description,
    tags: endpoint.tags,
    security: [{ [authKind]: [] }],
    ...(authKind === "apiKey" ? { "x-required-scopes": endpoint.scopes } : {}),
    ...(parameters.length > 0 ? { parameters } : {}),
    ...(endpoint.requestSchema
      ? { requestBody: { required: true, content: jsonContent(schemaOf(endpoint.requestSchema)) } }
      : {}),
    responses,
  };
}

function jsonContent(schema: Record<string, unknown>) {
  return { "application/json": { schema } };
}

/** OpenAPI path templates use {param}; Next.js route folders use [param] — same string either way here. */
function buildPaths(): Record<string, Record<string, unknown>> {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const endpoint of ENDPOINTS) {
    paths[endpoint.path] ??= {};
    paths[endpoint.path][endpoint.method] = toOperation(endpoint);
  }
  return paths;
}

export function buildOpenApiDocument(): Record<string, unknown> {
  return {
    openapi: "3.1.0",
    info: {
      title: "WCI OS API",
      version: "1.0.0-phase1",
      description:
        "Public/agent-facing API for WCI OS (CLAUDE.md 2.5). Every route under /api/v1, except this document itself, " +
        "requires a scoped API key. Issue one with `npm run issue-api-key -- --name <consumer>`. " +
        `Every response body follows one of two envelopes: {"data": ...} on success, or {"error": {"code", "message", "details?"}} on failure. ` +
        "Scopes: " +
        SCOPES.join(", ") +
        ". Default scopes per agent in the roster: " +
        Object.entries(AGENT_DEFAULT_SCOPES)
          .map(([agent, scopes]) => `${agent} [${scopes.join(", ")}]`)
          .join("; ") +
        ".",
    },
    servers: [{ url: "/api/v1" }],
    components: {
      securitySchemes: {
        apiKey: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "wci_<tokenId>_<secret>",
          description: 'Also accepted as the "x-api-key" header instead of Authorization.',
        },
        clientPortal: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "wcicps_<tokenId>_<secret> (session) or wcicpa_<tokenId>_<secret> (one-time action token)",
          description:
            "Client Portal auth (src/lib/client-portal/auth.ts) — a completely separate token namespace from apiKey, " +
            "never interchangeable with it even though both are Bearer tokens. A wcicps_ session comes from " +
            "POST /portal/login; a wcicpa_ token is a single-use link issued by staff/an agent " +
            "(POST /clients/{clientId}/portal-invite, /change-orders/{id}/approval-link, " +
            "/selections/{id}/options/{id}/approval-link) for headless, no-login approvals.",
        },
        vendorPortal: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "wcivps_<tokenId>_<secret> (session) or wcivpa_<tokenId>_<secret> (one-time action token)",
          description:
            "Vendor Portal auth (src/lib/vendor-portal/auth.ts) — the Phase 4 mirror of clientPortal, a completely " +
            "separate token namespace from both apiKey and clientPortal. A wcivps_ session comes from " +
            "POST /vendor-portal/login; a wcivpa_ token is a single-use link issued by staff/an agent " +
            "(POST /vendors/{vendorId}/portal-invite, /purchase-orders/{id}/approval-link) for headless PO acceptance.",
        },
        public: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "wcisrl_<tokenId>_<secret> (SubmittalReviewLink) or wcisvl_<tokenId>_<secret> (SurveyResponseLink)",
          description:
            "A single-use link token scoped to one standalone no-account record (src/lib/submittals/service.ts, " +
            "src/lib/surveys/service.ts) — the recipient (external reviewer, survey respondent) has no Client/Vendor " +
            "account or session at all, so this is neither clientPortal nor vendorPortal. A third, completely " +
            "separate token namespace, never interchangeable with apiKey/clientPortal/vendorPortal.",
        },
      },
    },
    paths: buildPaths(),
  };
}
