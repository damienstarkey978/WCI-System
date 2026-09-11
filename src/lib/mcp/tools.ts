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
 * Almost everything here reads. The exception is proposal drafting, and the reason
 * it is an exception is worth stating, because the original objection to MCP writes
 * still stands for everything else: Jarvis's CONFIRM tools queue a
 * JarvisPendingAction scoped to a JarvisConversation, and an MCP call has no
 * conversation to attach one to, so a money-moving or client-facing action here
 * would either skip its confirm-gate (unsafe) or silently fail (confusing).
 *
 * Drafting a proposal is neither. It creates a DRAFT that no client can see, and
 * sending — the act that actually reaches a client — is deliberately not exposed
 * here at all. That is the same line inbound email draws: an emailed receipt becomes
 * a bill sitting in INBOX, never an approved one. An outside assistant can do the
 * typing; a person still decides what goes out.
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
import { createLeadProposal } from "@/lib/crm/lead-proposal";
import { estimateTotalCents } from "@/lib/budget/funnel";

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
