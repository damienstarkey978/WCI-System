/**
 * MCP Connection (handoff.ai feature-parity pass) — the tool registry exposed to
 * external MCP clients (Claude Desktop, ChatGPT, Grok bots, etc.) authenticated via
 * an ApiKey (src/lib/api-auth.ts) through /api/mcp.
 *
 * Deliberately a separate registry from Jarvis's (src/lib/jarvis/tools.ts), not a
 * reuse of it: Jarvis's tools are `BetaRunnableTool` objects built by
 * `betaZodTool(...)`, an opaque type tied to Anthropic's own tool-runner — they
 * aren't valid MCP SDK tool registrations. This file re-wraps the same underlying
 * service functions (getWipReport, getDailyBrief, etc. — "one place computes the
 * numbers") using @modelcontextprotocol/sdk's own registration API instead.
 *
 * The authoritative write/read contract is still `/api/v1`. `api_v1_request` forwards
 * the caller's bearer token to that API so Atlas/Roy/Heather can manipulate any
 * documented endpoint without a second business-logic path. Convenience tools below
 * call the same services the routes use (reports, job progress, permits) for speed.
 *
 * Almost everything here reads. The exceptions are (1) the generic API proxy and
 * (2) proposal drafting. Proposal drafting creates a DRAFT that no client can see;
 * sending is deliberately not exposed here. Money-moving confirm-gated Jarvis
 * actions still require a human Confirm in the chat UI.
 *
 * Every tool is also gated on the calling key's scopes (src/lib/api-scopes.ts) —
 * a key without `reports:read` simply never sees the report tools in its MCP tool
 * list, the same contract /api/v1 already enforces. The proxy tool is always
 * registered: the API itself enforces scopes per route.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import type { ApiKeyContext } from "@/lib/api-auth";
import { grantsScope, type Scope } from "@/lib/api-scopes";
import { formatCostCodeCatalog } from "@/lib/ai/estimate-draft";
import { estimateTotalCents } from "@/lib/budget/funnel";
import { createLeadProposal } from "@/lib/crm/lead-proposal";
import { db } from "@/lib/db";
import { formatDate, formatMoney, formatPercent } from "@/lib/format";
import { getJobProgress, JobNotFoundError as ProgressJobNotFoundError } from "@/lib/jobs/progress";
import { callApiV1, formatApiV1ProxyResult } from "@/lib/mcp/api-proxy";
import { PermitTrade } from "@/generated/prisma/enums";
import {
  createJobPermit,
  ensureDefaultPermits,
  JobNotFoundError as PermitJobNotFoundError,
  setInspectionCompleted,
  updateInspectionFields,
  setPermitPulled,
} from "@/lib/permitting/service";
import {
  getBillableMilestones,
  getCostInboxItems,
  getJobsOverBudget,
  getOverdueInvoices,
  getProposalsNeedingFollowUp,
} from "@/lib/reports/daily-brief";
import {
  getBudgetedVsProjectedReport,
  getCashFlowReport,
  getInvoicingReport,
  getLaborReport,
  getProfitabilityReport,
  getWipReport,
} from "@/lib/reports/service";

export interface McpServerOptions {
  /** Absolute origin of this deployment, e.g. https://app.worldconstructionjax.com */
  readonly origin: string;
  /** Raw bearer token from the MCP request — forwarded to /api/v1 by api_v1_request. */
  readonly bearerToken: string;
}

function text(value: string): CallToolResult {
  return { content: [{ type: "text", text: value }] };
}

/**
 * A tool failure the caller can act on. The MCP SDK turns a thrown error into a
 * protocol-level error with no useful detail, and an assistant that gets one tends to
 * either retry the same call or make something up — so a refusal we understand (an
 * unknown lead, a missing contact email) comes back as ordinary text saying what to
 * fix, and only genuine faults are allowed to throw.
 */
function refusal(value: string): CallToolResult {
  return { content: [{ type: "text", text: value }], isError: true };
}

/**
 * Service errors that mean "the caller asked for something that doesn't work",
 * as opposed to a fault on our side. These become readable refusals; anything else
 * throws, so a real bug is never disguised as a polite no.
 */
const KNOWN_REFUSALS = new Set([
  "LeadNotFoundError",
  "LeadMissingContactError",
  "NoCostCodesError",
  "UnknownCostCodeError",
  "ClientNotFoundError",
  "JobNotFoundError",
  "EstimateNotFoundError",
  "EstimateJobMismatchError",
  "NoOptionsError",
  "TooManyOptionsError",
]);

/** Registers `tool` only when `auth` carries `scope` — an under-scoped key never sees it in its tool list at all. */
function registerScoped(
  server: McpServer,
  auth: ApiKeyContext,
  scope: Scope,
  name: string,
  config: { description: string; inputSchema?: z.ZodRawShape },
  run: (input: Record<string, unknown>) => Promise<CallToolResult>,
): void {
  if (!grantsScope(auth.scopes, scope)) return;
  server.registerTool(name, config, run as never);
}

/** Builds a fresh MCP server for one request, scoped to one authenticated organization. */
export function buildMcpServer(auth: ApiKeyContext, options: McpServerOptions): McpServer {
  const server = new McpServer({ name: "wci-os", version: "1.0.0" });
  const organizationId = auth.organizationId;

  // Generic REST bridge — always listed; /api/v1 re-checks scopes per route.
  server.registerTool(
    "api_v1_request",
    {
      description:
        "Call the WCI OS versioned agent API (/api/v1). Prefer this for any create/update/delete " +
        "or for endpoints without a dedicated MCP convenience tool. Path is relative to /api/v1 " +
        "(e.g. /jobs, /jobs/{id}/progress, /bills). Auth uses this connection's API key; scopes " +
        "are enforced by the API. See GET /api/v1/openapi.json for the contract.",
      inputSchema: {
        method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]).describe("HTTP method"),
        path: z.string().describe("Path under /api/v1, e.g. /jobs or jobs/abc/progress"),
        query: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional().describe("Query string params"),
        body: z.unknown().optional().describe("JSON body for POST/PUT/PATCH"),
      },
    },
    (async (rawInput: Record<string, unknown>) => {
      const input = rawInput as {
        method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
        path: string;
        query?: Record<string, string | number | boolean>;
        body?: unknown;
      };
      try {
        const result = await callApiV1({
          origin: options.origin,
          bearerToken: options.bearerToken,
          method: input.method,
          path: input.path,
          query: input.query,
          body: input.body,
        });
        return text(formatApiV1ProxyResult(result));
      } catch (error) {
        return refusal(error instanceof Error ? error.message : "api_v1_request failed");
      }
    }) as never,
  );

  registerScoped(
    server,
    auth,
    "jobs:read",
    "list_jobs",
    {
      description:
        "List this organization's jobs with their id, name, and status. " +
        "Optional search (q) matches name/prefix/address. Default limit 100 (max 200).",
      inputSchema: {
        q: z.string().optional().describe("Search name, prefix, or address"),
        limit: z.number().int().positive().max(200).optional().describe("Max rows (default 100, max 200)"),
      },
    },
    async (input) => {
      const { q, limit: limitRaw } = (input ?? {}) as { q?: string; limit?: number };
      const query = q?.trim();
      const limit = Math.min(Math.max(limitRaw ?? 100, 1), 200);
      const jobs = await db.job.findMany({
        where: {
          organizationId,
          isTemplate: false,
          ...(query
            ? {
                OR: [
                  { name: { contains: query, mode: "insensitive" } },
                  { prefix: { contains: query, mode: "insensitive" } },
                  { addressLine1: { contains: query, mode: "insensitive" } },
                  { city: { contains: query, mode: "insensitive" } },
                ],
              }
            : {}),
        },
        select: { id: true, name: true, status: true, prefix: true },
        orderBy: { createdAt: "desc" },
        take: limit,
      });
      if (jobs.length === 0) {
        return text(query ? `No jobs matched “${query}”.` : "This organization has no jobs yet.");
      }
      return text(
        jobs
          .map((job) => `${job.id} | ${job.prefix ? `${job.prefix} ` : ""}${job.name} | ${job.status}`)
          .join("\n"),
      );
    },
  );

  registerScoped(
    server,
    auth,
    "jobs:read",
    "get_job",
    { description: "Get a job's status, address, and contract type.", inputSchema: { jobId: z.string().describe("The job's id, from list_jobs") } },
    async (input) => {
      const jobId = (input as { jobId: string }).jobId;
      const job = await db.job.findFirst({
        where: { id: jobId, organizationId },
        select: { name: true, status: true, contractType: true, addressLine1: true, city: true, state: true },
      });
      if (!job) return text(`No job found with id ${jobId} in this organization.`);
      const address = [job.addressLine1, job.city, job.state].filter(Boolean).join(", ") || "no address on file";
      return text(`${job.name} | status: ${job.status} | contract: ${job.contractType} | address: ${address}`);
    },
  );

  registerScoped(
    server,
    auth,
    "jobs:read",
    "get_job_progress",
    {
      description:
        "Atlas/Heather rollup: schedule % complete, open todos, and permit/inspection counts for one job.",
      inputSchema: { jobId: z.string().describe("The job's id, from list_jobs") },
    },
    async (input) => {
      const jobId = (input as { jobId: string }).jobId;
      try {
        const progress = await getJobProgress(organizationId, jobId);
        return text(
          [
            `${progress.name} | ${progress.status}`,
            `Schedule: ${progress.schedule.avgPercentComplete}% avg across ${progress.schedule.itemCount} items (${progress.schedule.completedItemCount} at 100%)`,
            `Todos: ${progress.todos.openCount} open, ${progress.todos.inProgressCount} in progress, ${progress.todos.doneCount} done`,
            `Permits: ${progress.permits.pulledCount}/${progress.permits.tradeCount} pulled; inspections ${progress.permits.inspectionsCompleted}/${progress.permits.inspectionCount} complete`,
          ].join("\n"),
        );
      } catch (error) {
        if (error instanceof ProgressJobNotFoundError) return refusal(error.message);
        throw error;
      }
    },
  );

  registerScoped(
    server,
    auth,
    "permits:read",
    "list_job_permits",
    {
      description:
        "List this job's trade permits and inspections (read-only; does not create rows). " +
        "Also returns NOC/NTBO and the job Permit Rockstar ledger. " +
        "To add a permit use create_job_permit; for Building+MEP shells use ensure_job_permit_defaults. " +
        "To update Rockstar billing use PATCH /api/v1/jobs/{jobId}/permit-rockstar-ledger via api_v1_request.",
      inputSchema: { jobId: z.string().describe("The job's id") },
    },
    async (input) => {
      const jobId = (input as { jobId: string }).jobId;
      const job = await db.job.findFirst({
        where: { id: jobId, organizationId },
        select: {
          id: true,
          nocOnFile: true,
          nocNumber: true,
          ntboFiled: true,
          ntboNumber: true,
          permitRockstarPrivateProvider: true,
          permitRockstarSetupType: true,
          permitRockstarInvoiced: true,
          permitRockstarPaid: true,
          permitRockstarFeePerInspectionCents: true,
          permitRockstarInvoiceNumber: true,
          permitRockstarInvoiceAmountCents: true,
        },
      });
      if (!job) return refusal(`Job ${jobId} not found`);
      const permits = await db.jobPermit.findMany({
        where: { jobId, organizationId },
        orderBy: { trade: "asc" },
        include: {
          vendor: { select: { name: true, email: true } },
          inspections: {
            orderBy: { sortOrder: "asc" },
            select: { id: true, name: true, completedAt: true, passedAt: true, result: true },
          },
        },
      });
      const flags =
        `NOC=${job.nocOnFile ? "on file" : "missing"}${job.nocNumber ? ` #${job.nocNumber}` : ""}` +
        ` NTBO=${job.ntboFiled ? "filed" : "not filed"}${job.ntboNumber ? ` #${job.ntboNumber}` : ""}`;
      const rockstar =
        `Permit Rockstar: privateProvider=${job.permitRockstarPrivateProvider} setup=${job.permitRockstarSetupType ?? "unset"}` +
        ` invoiced=${job.permitRockstarInvoiced} paid=${job.permitRockstarPaid}` +
        ` feePerInspectionCents=${job.permitRockstarFeePerInspectionCents ?? "unset"}` +
        ` invoiceNumber=${job.permitRockstarInvoiceNumber ?? "unset"}` +
        ` invoiceAmountCents=${job.permitRockstarInvoiceAmountCents ?? "unset"}`;
      if (permits.length === 0) {
        return text(
          `${flags}\n${rockstar}\nNo permits on this job. Call create_job_permit (one trade) or ensure_job_permit_defaults (Building+MEP shells).`,
        );
      }
      return text(
        `${flags}\n${rockstar}\n` +
          permits
            .map((permit) => {
              const vendor = permit.vendor ? ` vendor=${permit.vendor.name}` : "";
              const inspections = permit.inspections
                .map((inspection) => `  ${inspection.id} | ${inspection.name} | ${inspection.completedAt ? "DONE" : "open"}`)
                .join("\n");
              return `${permit.id} | ${permit.trade} | ${permit.pulled ? "PULLED" : "not pulled"}${vendor}\n${inspections}`;
            })
            .join("\n"),
      );
    },
  );

  registerScoped(
    server,
    auth,
    "permits:write",
    "create_job_permit",
    {
      description:
        "Add one trade permit to a job (BUILDING, ELECTRICAL, PLUMBING, MECHANICAL, ROOFING, OTHER). " +
        "Seeds typical inspections by default. Use when validating which permits should exist on a job.",
      inputSchema: {
        jobId: z.string().describe("The job's id"),
        trade: z.enum([
          "BUILDING",
          "TEMP_POLE",
          "SITE",
          "ELECTRICAL",
          "PLUMBING",
          "MECHANICAL",
          "ROOFING",
          "OTHER",
        ]),
        label: z.string().optional().describe("Optional label to distinguish duplicate trades"),
        seedDefaultInspections: z.boolean().optional().describe("Default true"),
      },
    },
    async (input) => {
      const { jobId, trade, label, seedDefaultInspections } = input as {
        jobId: string;
        trade: keyof typeof PermitTrade;
        label?: string;
        seedDefaultInspections?: boolean;
      };
      try {
        const permit = await createJobPermit(organizationId, jobId, PermitTrade[trade], {
          seedDefaultInspections,
          label: label ?? null,
        });
        const inspections = permit.inspections.map((i) => `  ${i.id} | ${i.name}`).join("\n");
        return text(
          `${permit.id} | ${permit.trade}${permit.label ? ` (${permit.label})` : ""} | ${permit.status} | inspections:\n${inspections || "  (none)"}`,
        );
      } catch (error) {
        if (error instanceof PermitJobNotFoundError) return refusal(error.message);
        throw error;
      }
    },
  );

  registerScoped(
    server,
    auth,
    "permits:write",
    "ensure_job_permit_defaults",
    {
      description:
        "Explicit write: create Building + MEP permit shells for a job when missing (no inspections). " +
        "Prefer create_job_permit when adding a single trade with typical inspections.",
      inputSchema: { jobId: z.string().describe("The job's id") },
    },
    async (input) => {
      const jobId = (input as { jobId: string }).jobId;
      try {
        await ensureDefaultPermits(organizationId, jobId);
      } catch (error) {
        if (error instanceof PermitJobNotFoundError) return refusal(error.message);
        throw error;
      }
      const permits = await db.jobPermit.findMany({
        where: { jobId, organizationId },
        orderBy: { trade: "asc" },
        select: { id: true, trade: true, pulled: true },
      });
      return text(
        permits.map((permit) => `${permit.id} | ${permit.trade} | ${permit.pulled ? "PULLED" : "not pulled"}`).join("\n"),
      );
    },
  );

  registerScoped(
    server,
    auth,
    "permits:write",
    "set_permit_pulled",
    {
      description: "Mark a trade permit pulled or not pulled.",
      inputSchema: {
        permitId: z.string().describe("Permit id from list_job_permits"),
        pulled: z.boolean(),
      },
    },
    async (input) => {
      const { permitId, pulled } = input as { permitId: string; pulled: boolean };
      try {
        const permit = await setPermitPulled(organizationId, permitId, pulled);
        return text(`${permit.id} | ${permit.trade} | ${permit.pulled ? "PULLED" : "not pulled"}`);
      } catch (error) {
        if (error instanceof Error && error.name === "PermitNotFoundError") return refusal(error.message);
        throw error;
      }
    },
  );

  registerScoped(
    server,
    auth,
    "permits:write",
    "set_inspection_completed",
    {
      description:
        "Update a permit inspection: completed flag, result (PASS/FAIL/PARTIAL/PENDING), " +
        "real city pass date (passedAt as ISO or YYYY-MM-DD), confirmation number, inspector, " +
        "rename (name), and/or move to another permit on the same job (permitId).",
      inputSchema: {
        inspectionId: z.string().describe("Inspection id from list_job_permits"),
        completed: z.boolean().optional(),
        result: z.enum(["PENDING", "PASS", "FAIL", "PARTIAL"]).optional(),
        passedAt: z
          .string()
          .optional()
          .describe("Real city pass/completed date (YYYY-MM-DD or ISO), not entry time"),
        confirmationNumber: z.string().optional(),
        inspector: z.string().optional(),
        name: z.string().optional().describe("Rename the inspection"),
        permitId: z.string().optional().describe("Move to another JobPermit on the same job"),
      },
    },
    async (input) => {
      const {
        inspectionId,
        completed,
        result,
        passedAt,
        confirmationNumber,
        inspector,
        name,
        permitId,
      } = input as {
        inspectionId: string;
        completed?: boolean;
        result?: "PENDING" | "PASS" | "FAIL" | "PARTIAL";
        passedAt?: string;
        confirmationNumber?: string;
        inspector?: string;
        name?: string;
        permitId?: string;
      };
      try {
        const { parseDateOnly } = await import("@/lib/date-only");
        const parsedPassedAt =
          passedAt === undefined
            ? undefined
            : passedAt === ""
              ? null
              : /^\d{4}-\d{2}-\d{2}$/.test(passedAt)
                ? parseDateOnly(passedAt)
                : new Date(passedAt);
        const inspection =
          completed !== undefined &&
          result === undefined &&
          passedAt === undefined &&
          confirmationNumber === undefined &&
          inspector === undefined &&
          name === undefined &&
          permitId === undefined
            ? await setInspectionCompleted(organizationId, inspectionId, completed)
            : await updateInspectionFields(organizationId, inspectionId, {
                completed,
                result,
                passedAt: parsedPassedAt,
                confirmationNumber: confirmationNumber ?? undefined,
                inspector: inspector ?? undefined,
                name,
                permitId,
              });
        return text(
          `${inspection.id} | ${inspection.name} | result=${inspection.result}` +
            `${inspection.passedAt ? ` | passedAt=${inspection.passedAt.toISOString()}` : ""}` +
            `${inspection.confirmationNumber ? ` | conf=${inspection.confirmationNumber}` : ""}` +
            `${inspection.inspector ? ` | inspector=${inspection.inspector}` : ""}` +
            ` | ${inspection.completedAt ? "DONE" : "open"}`,
        );
      } catch (error) {
        if (error instanceof Error && error.name === "InspectionNotFoundError") return refusal(error.message);
        throw error;
      }
    },
  );

  registerScoped(
    server,
    auth,
    "daily-logs:read",
    "list_daily_logs",
    {
      description: "List recent daily logs, optionally for one job.",
      inputSchema: {
        jobId: z.string().optional().describe("Filter to one job"),
        limit: z.number().int().positive().max(50).optional().describe("Max rows (default 20)"),
      },
    },
    async (input) => {
      const { jobId, limit } = input as { jobId?: string; limit?: number };
      const logs = await db.dailyLog.findMany({
        where: { organizationId, ...(jobId ? { jobId } : {}) },
        orderBy: { createdAt: "desc" },
        take: limit ?? 20,
        select: { id: true, jobId: true, note: true, createdAt: true },
      });
      if (logs.length === 0) return text("No daily logs found.");
      return text(
        logs
          .map((log) => `${log.id} | job ${log.jobId} | ${formatDate(log.createdAt)} | ${log.note.slice(0, 120)}`)
          .join("\n"),
      );
    },
  );

  registerScoped(
    server,
    auth,
    "clients:read",
    "list_clients",
    { description: "List clients (homeowners) for coordination." },
    async () => {
      const clients = await db.client.findMany({
        where: { organizationId },
        select: { id: true, name: true, email: true, phone: true },
        orderBy: { name: "asc" },
        take: 100,
      });
      if (clients.length === 0) return text("No clients yet.");
      return text(clients.map((client) => `${client.id} | ${client.name} | ${client.email ?? "no email"} | ${client.phone ?? ""}`).join("\n"));
    },
  );

  registerScoped(
    server,
    auth,
    "vendors:read",
    "list_vendors",
    { description: "List vendors/subs for coordination." },
    async () => {
      const vendors = await db.vendor.findMany({
        where: { organizationId },
        select: { id: true, name: true, email: true, tradeType: true },
        orderBy: { name: "asc" },
        take: 100,
      });
      if (vendors.length === 0) return text("No vendors yet.");
      return text(
        vendors
          .map((vendor) => `${vendor.id} | ${vendor.name} | ${vendor.tradeType ?? ""} | ${vendor.email ?? "no email"}`)
          .join("\n"),
      );
    },
  );

  registerScoped(
    server,
    auth,
    "purchase-orders:read",
    "list_purchase_orders",
    {
      description: "List purchase orders (Roy/Duke financial ops).",
      inputSchema: { jobId: z.string().optional().describe("Filter to one job"), limit: z.number().int().positive().max(100).optional() },
    },
    async (input) => {
      const { jobId, limit } = input as { jobId?: string; limit?: number };
      const orders = await db.purchaseOrder.findMany({
        where: { organizationId, ...(jobId ? { jobId } : {}) },
        orderBy: { createdAt: "desc" },
        take: limit ?? 50,
        select: { id: true, jobId: true, status: true, poNumber: true },
      });
      if (orders.length === 0) return text("No purchase orders found.");
      return text(orders.map((order) => `${order.id} | ${order.poNumber} | job ${order.jobId} | ${order.status}`).join("\n"));
    },
  );

  registerScoped(
    server,
    auth,
    "bills:read",
    "list_bills",
    {
      description: "List bills (Roy/Duke AP).",
      inputSchema: { jobId: z.string().optional().describe("Filter to one job"), limit: z.number().int().positive().max(100).optional() },
    },
    async (input) => {
      const { jobId, limit } = input as { jobId?: string; limit?: number };
      const bills = await db.bill.findMany({
        where: { organizationId, ...(jobId ? { jobId } : {}) },
        orderBy: { createdAt: "desc" },
        take: limit ?? 50,
        select: {
          id: true,
          jobId: true,
          approvalStatus: true,
          vendorName: true,
          billNumber: true,
          lineItems: { select: { amountCents: true } },
        },
      });
      if (bills.length === 0) return text("No bills found.");
      return text(
        bills
          .map((bill) => {
            const total = bill.lineItems.reduce((sum, line) => sum + line.amountCents, 0);
            return `${bill.id} | ${bill.billNumber ?? "no#"} | ${bill.vendorName} | job ${bill.jobId} | ${bill.approvalStatus} | ${formatMoney(total)}`;
          })
          .join("\n"),
      );
    },
  );

  registerScoped(
    server,
    auth,
    "cost-codes:read",
    "list_cost_codes",
    { description: "List this organization's active cost codes." },
    async () => {
      const codes = await db.costCode.findMany({
        where: { organizationId, isActive: true },
        select: { id: true, code: true, name: true, defaultCostType: true },
        orderBy: { sortOrder: "asc" },
      });
      if (codes.length === 0) return text("This organization has no active cost codes.");
      return text(formatCostCodeCatalog(codes));
    },
  );

  registerScoped(
    server,
    auth,
    "reports:read",
    "get_profitability_report",
    { description: "Get projected profit and margin across every active job, sorted worst-margin-first." },
    async () => {
      const rows = await getProfitabilityReport(organizationId);
      if (rows.length === 0) return text("No active jobs to report on.");
      return text(
        rows
          .map(
            (row) =>
              `${row.jobName} | price ${formatMoney(row.revisedClientPriceCents)} | projected profit ${formatMoney(row.projectedProfitCents)} | margin ${formatPercent(row.projectedMarginBasisPoints)}`,
          )
          .join("\n"),
      );
    },
  );

  registerScoped(
    server,
    auth,
    "reports:read",
    "get_wip_report",
    { description: "Get the work-in-progress (over/under billing) report across every active job." },
    async () => {
      const rows = await getWipReport(organizationId);
      if (rows.length === 0) return text("No active jobs to report on.");
      return text(
        rows
          .map(
            (row) =>
              `${row.jobName} | ${formatPercent(row.percentCompleteBasisPoints)} complete | invoiced ${formatMoney(row.amountInvoicedCents)} | ${row.overUnderBillingCents >= 0 ? "overbilled" : "underbilled"} ${formatMoney(Math.abs(row.overUnderBillingCents))}`,
          )
          .join("\n"),
      );
    },
  );

  registerScoped(
    server,
    auth,
    "reports:read",
    "get_budget_vs_projected_report",
    { description: "Get every active job's revised budget vs. its currently projected cost — flags which jobs are running over budget." },
    async () => {
      const rows = await getBudgetedVsProjectedReport(organizationId);
      if (rows.length === 0) return text("No active jobs to report on.");
      return text(
        rows
          .map(
            (row) =>
              `${row.jobName} | budget ${formatMoney(row.revisedBudgetCostCents)} | projected ${formatMoney(row.projectedCostCents)} | ${row.isOverBudget ? "OVER BUDGET by" : "under budget by"} ${formatMoney(Math.abs(row.varianceCents))}`,
          )
          .join("\n"),
      );
    },
  );

  registerScoped(
    server,
    auth,
    "reports:read",
    "get_invoicing_report",
    { description: "Get every active job's invoiced-to-date, remaining-to-invoice, and total paid amounts." },
    async () => {
      const rows = await getInvoicingReport(organizationId);
      if (rows.length === 0) return text("No active jobs to report on.");
      return text(
        rows
          .map(
            (row) =>
              `${row.jobName} | invoiced ${formatMoney(row.amountInvoicedCents)} | remaining to invoice ${formatMoney(row.remainingToInvoiceCents)} | paid ${formatMoney(row.totalPaidCents)}`,
          )
          .join("\n"),
      );
    },
  );

  registerScoped(
    server,
    auth,
    "reports:read",
    "get_labor_report",
    { description: "Get every active job's budgeted vs. approved labor cost." },
    async () => {
      const rows = await getLaborReport(organizationId);
      if (rows.length === 0) return text("No active jobs to report on.");
      return text(
        rows.map((row) => `${row.jobName} | budgeted labor ${formatMoney(row.budgetedLaborCostCents)} | approved labor ${formatMoney(row.approvedLaborCostCents)}`).join("\n"),
      );
    },
  );

  registerScoped(
    server,
    auth,
    "reports:read",
    "get_cash_flow_report",
    {
      description: "Get cash in (payments received) vs. cash out (bills paid) over a trailing window, default 30 days.",
      inputSchema: { windowDays: z.number().int().positive().optional().describe("How many trailing days to cover — defaults to 30") },
    },
    async (input) => {
      const windowDays = (input as { windowDays?: number }).windowDays;
      const report = await getCashFlowReport(organizationId, { windowDays });
      const cashInCents = report.historical.reduce((total, day) => total + day.cashInCents, 0);
      const cashOutCents = report.historical.reduce((total, day) => total + day.cashOutCents, 0);
      return text(
        `Historical — cash in: ${formatMoney(cashInCents)} | cash out: ${formatMoney(cashOutCents)} | net: ${formatMoney(report.historicalNetCents)}. Projected — cash in: ${formatMoney(report.projection.projectedCashInCents)} | cash out: ${formatMoney(report.projection.projectedCashOutCents)}.`,
      );
    },
  );

  registerScoped(
    server,
    auth,
    "invoices:read",
    "get_overdue_invoices",
    {
      description:
        "List every invoice past its due date and not yet fully paid, across the whole organization. Requires invoices:read (not only reports:read).",
    },
    async () => {
      const invoices = await getOverdueInvoices(organizationId);
      if (invoices.length === 0) return text("No overdue invoices.");
      return text(
        invoices.map((invoice) => `${invoice.invoiceNumber} — ${invoice.jobName} — ${formatMoney(invoice.amountCents)}, due ${formatDate(invoice.dueOn)}`).join("\n"),
      );
    },
  );

  registerScoped(
    server,
    auth,
    "reports:read",
    "get_jobs_over_budget",
    { description: "List active jobs whose projected cost has overtaken the revised budget." },
    async () => {
      const jobs = await getJobsOverBudget(organizationId);
      if (jobs.length === 0) return text("No jobs are over budget.");
      // varianceCents is revisedBudget − projected (negative when over). Abs matches
      // get_budget_vs_projected_report's "OVER BUDGET by $X" wording — never print a
      // negative amount after the words "over by".
      return text(jobs.map((job) => `${job.jobName} — over by ${formatMoney(Math.abs(job.varianceCents))}`).join("\n"));
    },
  );

  registerScoped(
    server,
    auth,
    "proposals:read",
    "get_proposals_needing_follow_up",
    { description: "List proposals sent to a client 5+ days ago with no response yet (not accepted or declined)." },
    async () => {
      const proposals = await getProposalsNeedingFollowUp(organizationId);
      if (proposals.length === 0) return text("No proposals need follow-up right now.");
      return text(proposals.map((proposal) => `"${proposal.title}" — ${proposal.clientName} — sent ${formatDate(proposal.sentAt)}`).join("\n"));
    },
  );

  registerScoped(
    server,
    auth,
    "invoices:read",
    "get_billable_milestones",
    { description: "List draw-schedule milestones whose trigger date has passed but haven't been invoiced yet." },
    async () => {
      const milestones = await getBillableMilestones(organizationId);
      if (milestones.length === 0) return text("No milestones are ready to bill right now.");
      return text(milestones.map((milestone) => `${milestone.title} — ${milestone.jobName}`).join("\n"));
    },
  );

  registerScoped(
    server,
    auth,
    "bills:read",
    "get_cost_inbox_items",
    { description: "List AI-scanned bills still awaiting a human's approve/reject before they count toward any job's budget." },
    async () => {
      const items = await getCostInboxItems(organizationId);
      if (items.length === 0) return text("The cost inbox is empty — nothing awaiting review.");
      return text(items.map((item) => `${item.vendorLabel} — ${item.jobName} — ${formatMoney(item.amountCents)}`).join("\n"));
    },
  );

  registerScoped(
    server,
    auth,
    "reports:read",
    "get_daily_brief",
    {
      description:
        "Get the full 'what needs attention today' digest across the whole organization: overdue invoices, jobs over budget, unapproved timesheets, change orders pending approval, proposals needing follow-up, billable milestones, and the cost inbox. Invoice numbers/amounts and billable milestones require invoices:read; cost-inbox amounts require bills:read; proposal titles require proposals:read — without those scopes the matching lines are redacted.",
    },
    async () => {
      // Scope-gated fetches: never load invoice/bill/proposal rows without the
      // matching :read scope (A10 — reports:read alone must not leak amounts).
      const canInvoices = grantsScope(auth.scopes, "invoices:read");
      const canBills = grantsScope(auth.scopes, "bills:read");
      const canProposals = grantsScope(auth.scopes, "proposals:read");

      const [overdueInvoices, jobsOverBudget, unapprovedShiftCount, pendingChangeOrderCount, proposalsNeedingFollowUp, billableMilestones, costInboxItems] =
        await Promise.all([
          canInvoices ? getOverdueInvoices(organizationId) : Promise.resolve([] as const),
          getJobsOverBudget(organizationId),
          db.timeClockEntry.count({ where: { organizationId, approvalStatus: "PENDING" } }),
          db.changeOrder.count({ where: { organizationId, status: "PENDING_APPROVAL" } }),
          canProposals ? getProposalsNeedingFollowUp(organizationId) : Promise.resolve([] as const),
          canInvoices ? getBillableMilestones(organizationId) : Promise.resolve([] as const),
          canBills ? getCostInboxItems(organizationId) : Promise.resolve([] as const),
        ]);

      const overdueTotalCents = overdueInvoices.reduce((total, invoice) => total + invoice.amountCents, 0);
      const lines: string[] = [
        !canInvoices
          ? "Overdue invoices: (redacted — needs invoices:read)"
          : overdueInvoices.length === 0
            ? "Overdue invoices: none"
            : `Overdue invoices: ${overdueInvoices.length} totaling ${formatMoney(overdueTotalCents)}`,
        jobsOverBudget.length === 0 ? "Jobs over budget: none" : `Jobs over budget: ${jobsOverBudget.map((job) => job.jobName).join(", ")}`,
        unapprovedShiftCount === 0 ? "Unapproved timesheets: none" : `Unapproved timesheets: ${unapprovedShiftCount}`,
        pendingChangeOrderCount === 0 ? "Change orders pending approval: none" : `Change orders pending approval: ${pendingChangeOrderCount}`,
        !canProposals
          ? "Proposals needing follow-up: (redacted — needs proposals:read)"
          : proposalsNeedingFollowUp.length === 0
            ? "Proposals needing follow-up: none"
            : `Proposals needing follow-up: ${proposalsNeedingFollowUp.map((proposal) => proposal.title).join(", ")}`,
        !canInvoices
          ? "Billable milestones ready: (redacted — needs invoices:read)"
          : billableMilestones.length === 0
            ? "Billable milestones ready: none"
            : `Billable milestones ready: ${billableMilestones.map((milestone) => milestone.title).join(", ")}`,
        !canBills
          ? "Cost inbox: (redacted — needs bills:read)"
          : costInboxItems.length === 0
            ? "Cost inbox: empty"
            : `Cost inbox: ${costInboxItems.length} bill(s) awaiting review`,
      ];
      return text(lines.join("\n"));
    },
  );

  // --- Sales: drafting a proposal from an outside assistant ------------------
  //
  // The connected assistant does the drafting, not this server. It is already in the
  // conversation where the scope of work was discussed, it has the photos and the
  // client's own words, and it is a capable estimator — so it composes the line items
  // and calls create_proposal_for_lead to persist them. Running WCI OS's own drafting
  // model from here would be a second AI working from a worse summary of the same
  // conversation, at twice the cost.

  registerScoped(
    server,
    auth,
    "leads:read",
    "list_leads",
    { description: "List this organization's sales leads, newest first, with the id needed to draft a proposal against one." },
    async () => {
      const leads = await db.lead.findMany({
        where: { organizationId },
        select: { id: true, name: true, title: true, stage: true, email: true, city: true },
        orderBy: { createdAt: "desc" },
        take: 50,
      });
      if (leads.length === 0) return text("This organization has no leads yet.");
      return text(
        leads
          .map((lead) => {
            const where = lead.city ? ` | ${lead.city}` : "";
            // The email is shown because a lead without one cannot become a proposal —
            // better to see that here than to be refused after composing an estimate.
            const contact = lead.email ?? "NO EMAIL ON FILE — a proposal needs one";
            return `${lead.id} | ${lead.title ?? lead.name} | ${lead.stage} | ${contact}${where}`;
          })
          .join("\n"),
      );
    },
  );

  registerScoped(
    server,
    auth,
    "proposals:write",
    "create_proposal_for_lead",
    {
      description:
        "Draft a priced proposal against a sales lead. Creates the estimate and the client-facing proposal together, " +
        "as a DRAFT that no client can see — a person reviews and sends it from WCI OS. Call list_leads for the lead " +
        "id and list_cost_codes for the cost code ids; every line item must use a cost code from that catalog.",
      inputSchema: {
        leadId: z.string().describe("The lead's id, from list_leads."),
        title: z.string().describe("What this proposal is for, e.g. 'Kitchen remodel — Phillips residence'."),
        coverMessage: z.string().nullish().describe("Optional note to the client, shown above the pricing."),
        clientEmail: z.string().nullish().describe("Only if it differs from the email already on the lead."),
        clientPhone: z.string().nullish().describe("Only if it differs from the phone already on the lead."),
        lineItems: z
          .array(
            z.object({
              costCodeId: z.string().describe("A cost code id from list_cost_codes. Never invent one."),
              title: z.string().describe("What this line is, e.g. '2x4x8 lumber' or 'Framing labor'."),
              description: z.string().nullish().describe("Optional detail shown to the client."),
              quantityMilli: z
                .number()
                .int()
                .positive()
                .optional()
                .describe("Quantity in THOUSANDTHS, so 2.5 units is 2500. Defaults to 1000 (one unit)."),
              unitCostCents: z
                .number()
                .int()
                .positive()
                .describe("YOUR COST for one unit, in CENTS, before markup. $12.50 is 1250."),
              rateBasisPoints: z
                .number()
                .int()
                .min(0)
                .optional()
                .describe("Markup in BASIS POINTS on top of cost, so 20% is 2000. Omit to use the org's default."),
              taxable: z.boolean().optional().describe("Whether sales tax applies to this line."),
            }),
          )
          .min(1)
          .describe("The priced scope of work. One line per item the client should see."),
        sections: z
          .array(
            z.object({
              title: z.string().describe("A heading, e.g. 'What's included' or 'Timeline'."),
              bullets: z.array(z.string()).describe("Short plain-language points under that heading."),
            }),
          )
          .optional()
          .describe("The narrative the client reads alongside the pricing. Optional but strongly recommended."),
      },
    },
    async (rawInput) => {
      const input = rawInput as {
        leadId: string;
        title: string;
        coverMessage?: string | null;
        clientEmail?: string | null;
        clientPhone?: string | null;
        lineItems: {
          costCodeId: string;
          title: string;
          description?: string | null;
          quantityMilli?: number;
          unitCostCents: number;
          rateBasisPoints?: number;
          taxable?: boolean;
        }[];
        sections?: { title: string; bullets: string[] }[];
      };

      try {
        const proposal = await createLeadProposal({
          organizationId,
          leadId: input.leadId,
          title: input.title,
          coverMessage: input.coverMessage,
          clientEmail: input.clientEmail,
          clientPhone: input.clientPhone,
          lineItems: input.lineItems.map((line) => ({
            costCodeId: line.costCodeId,
            title: line.title,
            description: line.description,
            quantityMilli: line.quantityMilli,
            unitCostCents: line.unitCostCents,
            rateBasisPoints: line.rateBasisPoints,
            taxable: line.taxable,
          })),
          proposalSections: input.sections?.map((section) => ({ title: section.title, bullets: section.bullets })),
          // Drafted by a model, even though the model is on the other end of the
          // connection rather than inside WCI OS. Whoever reviews this should know
          // that before they send it to a client.
          aiGenerated: true,
          aiPromptNotes: `Drafted over MCP by "${auth.name}".`,
        });

        return text(
          `Created DRAFT proposal ${proposal.id} — "${proposal.title}". ` +
            `Nothing has been sent: open it in WCI OS under Sales to review, edit, and send it.`,
        );
      } catch (error) {
        // Everything this service refuses is something the caller can fix by asking a
        // better question or picking a different id, so it comes back as readable text.
        if (error instanceof Error && KNOWN_REFUSALS.has(error.name)) return refusal(error.message);
        throw error;
      }
    },
  );

  registerScoped(
    server,
    auth,
    "proposals:read",
    "get_proposal",
    {
      description: "Read back a proposal: its status, its priced options and their totals, and its client-facing sections.",
      inputSchema: { proposalId: z.string().describe("The proposal's id, e.g. from create_proposal_for_lead.") },
    },
    async (rawInput) => {
      const proposalId = (rawInput as { proposalId: string }).proposalId;
      const proposal = await db.proposal.findFirst({
        where: { id: proposalId, organizationId },
        select: {
          title: true,
          status: true,
          coverMessage: true,
          sentAt: true,
          options: {
            orderBy: { sortOrder: "asc" },
            select: {
              label: true,
              estimate: {
                select: {
                  title: true,
                  // Totals are computed from the lines, never stored — estimateTotalCents
                  // is the one place that does it, so this can't drift from what the
                  // proposal editor, the PDF and the client's own view show.
                  lineItems: { select: { quantityMilli: true, unitCostCents: true, rateMode: true, rateBasisPoints: true } },
                },
              },
            },
          },
          sections: { orderBy: { sortOrder: "asc" }, select: { title: true, bullets: { orderBy: { sortOrder: "asc" }, select: { text: true } } } },
        },
      });
      if (!proposal) return refusal(`No proposal found with id ${proposalId} in this organization.`);

      const lines = [
        `${proposal.title} | status: ${proposal.status} | ${proposal.sentAt ? `sent ${formatDate(proposal.sentAt)}` : "not sent"}`,
        ...(proposal.coverMessage ? [`Cover message: ${proposal.coverMessage}`] : []),
        ...proposal.options.map(
          (option) =>
            `${option.label}: ${option.estimate.title} — ${formatMoney(estimateTotalCents(option.estimate.lineItems))}`,
        ),
        ...proposal.sections.flatMap((section) => [section.title, ...section.bullets.map((bullet) => `  - ${bullet.text}`)]),
      ];
      return text(lines.join("\n"));
    },
  );

  return server;
}
