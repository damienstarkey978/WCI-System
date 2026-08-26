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
  aiDraftEstimateSchema,
  bulkClockInSchema,
  clockInSchema,
  clockOutSchema,
  closeBidPackageSchema,
  convertLeadToJobSchema,
  createAllowanceSchema,
  createBidPackageSchema,
  createBillSchema,
  createClientSchema,
  createCostCodeSchema,
  createDrawScheduleSchema,
  createEstimateSchema,
  createInvoiceSchema,
  createJobSchema,
  createLeadSchema,
  createProposalSchema,
  createPurchaseOrderSchema,
  createSelectionSchema,
  createVendorSchema,
  createWebhookSubscriptionSchema,
  emitEventSchema,
  grantJobAccessSchema,
  grantVendorJobAccessSchema,
  inviteVendorToBidSchema,
  matchByRoadNameSchema,
  portalAcceptProposalSchema,
  portalAcceptPurchaseOrderSchema,
  portalApproveChangeOrderSchema,
  pushBidToPurchaseOrderSchema,
  recordPaymentSchema,
  requestApprovalLinkSchema,
  requestVendorApprovalLinkSchema,
  submitBidSchema,
  transitionJobStatusSchema,
  updateBillStatusSchema,
  updateLeadStageSchema,
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
   */
  readonly authKind?: "apiKey" | "clientPortal" | "vendorPortal";
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
    summary: "Create a proposal (the e-sign wrapper around an Estimate)",
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
      "POST /proposals/{id}/approval-link. Accepting chains three already-existing actions: e-signs the " +
      "proposal, moves the Job from PRE_SALE to OPEN, and sends its Estimate to the Budget. Not gated by " +
      "ClientJobAccess — at PRE_SALE the client typically has no job access yet.",
    tags: ["CRM", "Client Portal"],
    authKind: "clientPortal",
    scopes: [],
    pathParams: ["proposalId"],
    requestSchema: portalAcceptProposalSchema,
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
  const isPortal = authKind !== "apiKey";

  const responses: Record<string, unknown> = {
    [String(endpoint.successStatus ?? 200)]: {
      description: endpoint.successDescription ?? "Success. See CLAUDE.md and the route source for the exact response shape.",
    },
    "401": {
      description: isPortal ? "Missing or invalid portal session/action token." : "Missing or invalid API key.",
      content: jsonContent(ERROR_SCHEMA),
    },
    "403": {
      description: isPortal
        ? `The ${authKind === "clientPortal" ? "client" : "vendor"} has access to the job but not this module (${authKind === "clientPortal" ? "ClientJobAccess" : "VendorJobAccess"}).`
        : "The API key lacks a required scope.",
      content: jsonContent(ERROR_SCHEMA),
    },
  };
  if (endpoint.requestSchema) {
    responses["422"] = { description: "Validation failed.", content: jsonContent(ERROR_SCHEMA) };
  }

  return {
    summary: endpoint.summary,
    description: endpoint.description,
    tags: endpoint.tags,
    security: [{ [authKind]: [] }],
    ...(isPortal ? {} : { "x-required-scopes": endpoint.scopes }),
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
      },
    },
    paths: buildPaths(),
  };
}
