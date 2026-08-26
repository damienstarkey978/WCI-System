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
  aiDraftEstimateSchema,
  bulkClockInSchema,
  clockInSchema,
  clockOutSchema,
  createAllowanceSchema,
  createBillSchema,
  createClientSchema,
  createCostCodeSchema,
  createDrawScheduleSchema,
  createEstimateSchema,
  createInvoiceSchema,
  createJobSchema,
  createPurchaseOrderSchema,
  createSelectionSchema,
  createWebhookSubscriptionSchema,
  emitEventSchema,
  grantJobAccessSchema,
  matchByRoadNameSchema,
  portalApproveChangeOrderSchema,
  recordPaymentSchema,
  requestApprovalLinkSchema,
  transitionJobStatusSchema,
  updateBillStatusSchema,
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
   * required ones. "clientPortal": a Client Portal ClientSession or
   * ClientActionToken (src/lib/client-portal/auth.ts) — a completely
   * separate token namespace (CLAUDE.md 2.1/2.3), never interchangeable with
   * an ApiKey even though both travel as `Authorization: Bearer`. `scopes`
   * is ignored for clientPortal endpoints; per-job module gating
   * (ClientJobAccess) isn't a static scope and is documented in `description`.
   */
  readonly authKind?: "apiKey" | "clientPortal";
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

  const isClientPortal = endpoint.authKind === "clientPortal";

  const responses: Record<string, unknown> = {
    [String(endpoint.successStatus ?? 200)]: {
      description: endpoint.successDescription ?? "Success. See CLAUDE.md and the route source for the exact response shape.",
    },
    "401": {
      description: isClientPortal ? "Missing or invalid portal session/action token." : "Missing or invalid API key.",
      content: jsonContent(ERROR_SCHEMA),
    },
    "403": {
      description: isClientPortal
        ? "The client has access to the job but not this module (ClientJobAccess)."
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
    security: [{ [isClientPortal ? "clientPortal" : "apiKey"]: [] }],
    ...(isClientPortal ? {} : { "x-required-scopes": endpoint.scopes }),
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
      },
    },
    paths: buildPaths(),
  };
}
