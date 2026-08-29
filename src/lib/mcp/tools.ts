/**
 * MCP Connection (handoff.ai feature-parity pass) — the tool registry exposed to
 * external MCP clients (Claude Desktop, ChatGPT, etc.) authenticated via an ApiKey
 * (src/lib/api-auth.ts) through /api/mcp.
 *
 * Deliberately a separate registry from Jarvis's (src/lib/jarvis/tools.ts), not a
 * reuse of it: Jarvis's tools are `BetaRunnableTool` objects built by
 * `betaZodTool(...)`, an opaque type tied to Anthropic's own tool-runner — they
 * aren't valid MCP SDK tool registrations. This file re-wraps the same underlying
 * service functions (getWipReport, getDailyBrief, etc. — "one place computes the
 * numbers") using @modelcontextprotocol/sdk's own registration API instead.
 *
 * Read-only by design for v1: every tool here only reads. Jarvis's CONFIRM tools
 * queue a JarvisPendingAction, which is scoped to a JarvisConversation (a chat
 * thread) — an MCP call has no conversation to attach one to. Wiring up MCP writes
 * needs a pending-action origin that isn't conversation-shaped; until that exists,
 * exposing a write tool here would mean either skipping the confirm-gate (unsafe)
 * or silently failing (confusing), so money-moving and client-facing actions are
 * left out rather than done unsafely.
 *
 * Every tool is also gated on the calling key's scopes (src/lib/api-scopes.ts) —
 * a key without `reports:read` simply never sees the report tools in its MCP tool
 * list, the same contract /api/v1 already enforces.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import type { ApiKeyContext } from "@/lib/api-auth";
import { grantsScope, type Scope } from "@/lib/api-scopes";
import { formatCostCodeCatalog } from "@/lib/ai/estimate-draft";
import { db } from "@/lib/db";
import { formatDate, formatMoney, formatPercent } from "@/lib/format";
import {
  getBillableMilestones,
  getCostInboxItems,
  getDailyBrief,
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

function text(value: string): CallToolResult {
  return { content: [{ type: "text", text: value }] };
}

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
export function buildMcpServer(auth: ApiKeyContext): McpServer {
  const server = new McpServer({ name: "wci-os", version: "1.0.0" });
  const organizationId = auth.organizationId;

  registerScoped(
    server,
    auth,
    "jobs:read",
    "list_jobs",
    { description: "List this organization's jobs with their id, name, and status." },
    async () => {
      const jobs = await db.job.findMany({
        where: { organizationId, isTemplate: false },
        select: { id: true, name: true, status: true },
        orderBy: { createdAt: "desc" },
        take: 50,
      });
      if (jobs.length === 0) return text("This organization has no jobs yet.");
      return text(jobs.map((job) => `${job.id} | ${job.name} | ${job.status}`).join("\n"));
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
    "reports:read",
    "get_overdue_invoices",
    { description: "List every invoice past its due date and not yet fully paid, across the whole organization." },
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
      return text(jobs.map((job) => `${job.jobName} — over by ${formatMoney(job.varianceCents)}`).join("\n"));
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
        "Get the full 'what needs attention today' digest across the whole organization: overdue invoices, jobs over budget, unapproved timesheets, change orders pending approval, proposals needing follow-up, billable milestones, and the cost inbox.",
    },
    async () => {
      const brief = await getDailyBrief(organizationId);
      const lines: string[] = [
        brief.overdueInvoices.length === 0
          ? "Overdue invoices: none"
          : `Overdue invoices: ${brief.overdueInvoices.length} totaling ${formatMoney(brief.overdueInvoiceTotalCents)}`,
        brief.jobsOverBudget.length === 0 ? "Jobs over budget: none" : `Jobs over budget: ${brief.jobsOverBudget.map((job) => job.jobName).join(", ")}`,
        brief.unapprovedShiftCount === 0 ? "Unapproved timesheets: none" : `Unapproved timesheets: ${brief.unapprovedShiftCount}`,
        brief.pendingChangeOrderCount === 0 ? "Change orders pending approval: none" : `Change orders pending approval: ${brief.pendingChangeOrderCount}`,
        brief.proposalsNeedingFollowUp.length === 0
          ? "Proposals needing follow-up: none"
          : `Proposals needing follow-up: ${brief.proposalsNeedingFollowUp.map((proposal) => proposal.title).join(", ")}`,
        brief.billableMilestones.length === 0
          ? "Billable milestones ready: none"
          : `Billable milestones ready: ${brief.billableMilestones.map((milestone) => milestone.title).join(", ")}`,
        brief.costInboxItems.length === 0 ? "Cost inbox: empty" : `Cost inbox: ${brief.costInboxItems.length} bill(s) awaiting review`,
      ];
      return text(lines.join("\n"));
    },
  );

  return server;
}
