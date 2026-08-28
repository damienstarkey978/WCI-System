/**
 * Jarvis's tool registry (Phase 10b). Every tool here is either:
 *
 *   - AUTO — read-only lookups, or internal-only records (a DRAFT change order, a
 *     daily log note, an RFI, a to-do). These execute immediately, matching the
 *     user's "auto-execute low-risk" instruction. New internal-only records default
 *     to NOT client-visible even where the human-facing form defaults to visible
 *     (createDailyLog), so Jarvis never puts something in front of a client as a
 *     side effect of a tool a human didn't review.
 *
 *   - CONFIRM — anything client-facing or money-moving (sending an invoice or
 *     proposal). These never run the real action; they only call
 *     createPendingAction, which just writes a row.
 *     src/lib/jarvis/pending-actions.ts's confirmPendingAction is the only code
 *     path that performs the real effect, and it only runs from a human clicking
 *     Confirm in the chat UI — Jarvis has no way to call it itself.
 *
 * Honesty constraint: WCI OS has no outbound email integration anywhere yet (no
 * mailer is configured in this codebase). "Send" tools here mean the in-app action
 * a Send button performs (e.g. Invoice.status -> SENT, which is what makes it appear
 * in the client portal and count toward the funnel) — never an email being
 * dispatched. find_job_files hands back a real link for a human to forward
 * themselves; it does not claim to email anyone.
 */

import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";

import { ChangeOrderMode, ChangeOrderStatus, InvoiceStatus, ProposalStatus } from "@/generated/prisma/enums";
import { formatCostCodeCatalog } from "@/lib/ai/estimate-draft";
import type { JarvisTool } from "@/lib/jarvis/assistant";
import { createChangeOrder } from "@/lib/change-orders/service";
import { db } from "@/lib/db";
import { createDailyLog } from "@/lib/daily-logs/service";
import { resolveFileUrl } from "@/lib/files/service";
import { formatDate, formatMoney } from "@/lib/format";
import { createPendingAction } from "@/lib/jarvis/pending-actions";
import { parseDollarsToCents } from "@/lib/money";
import { createRfi } from "@/lib/rfis/service";
import { createTodo } from "@/lib/todos/service";

export interface JarvisToolContext {
  readonly organizationId: string;
  readonly conversationId: string;
  readonly userId: string;
}

async function requireJob(organizationId: string, jobId: string) {
  return db.job.findFirst({ where: { id: jobId, organizationId }, select: { id: true, name: true, status: true } });
}

export function buildJarvisTools(ctx: JarvisToolContext): JarvisTool[] {
  // --- AUTO: read-only lookups -------------------------------------------------

  const listJobs = betaZodTool({
    name: "list_jobs",
    description:
      "List this organization's jobs with their id, name, and status. Call this first whenever you need a job's id — never guess or invent one.",
    inputSchema: z.object({}),
    run: async () => {
      const jobs = await db.job.findMany({
        where: { organizationId: ctx.organizationId },
        select: { id: true, name: true, status: true },
        orderBy: { createdAt: "desc" },
        take: 50,
      });
      if (jobs.length === 0) return "This organization has no jobs yet.";
      return jobs.map((job) => `${job.id} | ${job.name} | ${job.status}`).join("\n");
    },
  });

  const listCostCodes = betaZodTool({
    name: "list_cost_codes",
    description: "List this organization's active cost codes. Needed before drafting a change order.",
    inputSchema: z.object({}),
    run: async () => {
      const codes = await db.costCode.findMany({
        where: { organizationId: ctx.organizationId, isActive: true },
        select: { id: true, code: true, name: true, defaultCostType: true },
        orderBy: { sortOrder: "asc" },
      });
      if (codes.length === 0) return "This organization has no active cost codes.";
      return formatCostCodeCatalog(codes);
    },
  });

  const getJobOverview = betaZodTool({
    name: "get_job_overview",
    description: "Get a job's status, address, and contract type. Pass the job's id from list_jobs.",
    inputSchema: z.object({ jobId: z.string().describe("The job's id, from list_jobs") }),
    run: async (input) => {
      const job = await db.job.findFirst({
        where: { id: input.jobId, organizationId: ctx.organizationId },
        select: { name: true, status: true, contractType: true, addressLine1: true, city: true, state: true },
      });
      if (!job) return `No job found with id ${input.jobId} in this organization.`;
      const address = [job.addressLine1, job.city, job.state].filter(Boolean).join(", ") || "no address on file";
      return `${job.name} | status: ${job.status} | contract: ${job.contractType} | address: ${address}`;
    },
  });

  const getJobFinancialSummary = betaZodTool({
    name: "get_job_financial_summary",
    description: "Get a job's invoicing summary: total invoiced and any draft invoices waiting to be sent. Pass the job's id from list_jobs.",
    inputSchema: z.object({ jobId: z.string().describe("The job's id, from list_jobs") }),
    run: async (input) => {
      const job = await requireJob(ctx.organizationId, input.jobId);
      if (!job) return `No job found with id ${input.jobId} in this organization.`;

      const invoices = await db.invoice.findMany({
        where: { jobId: job.id },
        select: { invoiceNumber: true, status: true, amountCents: true },
        orderBy: { createdAt: "asc" },
      });
      const totalInvoicedCents = invoices
        .filter((inv) => inv.status !== InvoiceStatus.DRAFT && inv.status !== InvoiceStatus.VOID)
        .reduce((sum, inv) => sum + inv.amountCents, 0);
      const draftInvoices = invoices.filter((inv) => inv.status === InvoiceStatus.DRAFT);

      return [
        `Job: ${job.name}`,
        `Total invoiced (sent or later): ${formatMoney(totalInvoicedCents)}`,
        draftInvoices.length === 0
          ? "No draft invoices waiting to be sent."
          : `Draft invoices waiting to be sent:\n${draftInvoices.map((inv) => `  - ${inv.invoiceNumber} (${formatMoney(inv.amountCents)})`).join("\n")}`,
      ].join("\n");
    },
  });

  const listOpenChangeOrders = betaZodTool({
    name: "list_open_change_orders",
    description: "List a job's DRAFT and PENDING_APPROVAL change orders. Pass the job's id from list_jobs.",
    inputSchema: z.object({ jobId: z.string().describe("The job's id, from list_jobs") }),
    run: async (input) => {
      const job = await requireJob(ctx.organizationId, input.jobId);
      if (!job) return `No job found with id ${input.jobId} in this organization.`;

      const changeOrders = await db.changeOrder.findMany({
        where: { jobId: job.id, status: { in: [ChangeOrderStatus.DRAFT, ChangeOrderStatus.PENDING_APPROVAL] } },
        select: { id: true, title: true, status: true, flatClientPriceCents: true },
        orderBy: { createdAt: "desc" },
      });
      if (changeOrders.length === 0) return `${job.name} has no open change orders.`;
      return changeOrders
        .map((co) => `${co.id} | ${co.title} | ${co.status}${co.flatClientPriceCents ? ` | ${formatMoney(co.flatClientPriceCents)}` : ""}`)
        .join("\n");
    },
  });

  const findJobFiles = betaZodTool({
    name: "find_job_files",
    description:
      "Find files on file for a job (plans, documents, photos) by a search word in the file name (e.g. 'plan' finds plan sets). Returns a real link to each file. This does NOT send or email anything — WCI OS has no email-sending capability yet, so hand the link to the user and they'll need to forward it themselves.",
    inputSchema: z.object({
      jobId: z.string().describe("The job's id, from list_jobs"),
      searchText: z.string().describe("A word to search for in the file name, e.g. 'plan', 'permit', 'contract'"),
    }),
    run: async (input) => {
      const job = await requireJob(ctx.organizationId, input.jobId);
      if (!job) return `No job found with id ${input.jobId} in this organization.`;

      const files = await db.file.findMany({
        where: { jobId: job.id, fileName: { contains: input.searchText, mode: "insensitive" } },
        select: { fileName: true, url: true },
        take: 10,
      });
      if (files.length === 0) return `No files matching "${input.searchText}" found for ${job.name}.`;

      const withLinks = await Promise.all(
        files.map(async (file) => `${file.fileName}: ${await resolveFileUrl(file.url)}`),
      );
      return withLinks.join("\n");
    },
  });

  // --- AUTO: internal-only record creation -------------------------------------

  const createChangeOrderDraft = betaZodTool({
    name: "create_change_order_draft",
    description:
      "Draft a new flat-price change order for a job. Created as DRAFT — internal only, invisible to the client until a human explicitly sends it for approval. Call list_cost_codes first to get a valid costCodeId.",
    inputSchema: z.object({
      jobId: z.string().describe("The job's id, from list_jobs"),
      title: z.string().describe("What the change order is for, e.g. 'Add egress window to basement bedroom'"),
      costCodeId: z.string().describe("A cost code id from list_cost_codes"),
      costDollars: z.number().positive().describe("WCI's cost for this change, in dollars"),
      clientPriceDollars: z.number().positive().describe("The price charged to the client for this change, in dollars"),
    }),
    run: async (input) => {
      const job = await requireJob(ctx.organizationId, input.jobId);
      if (!job) return `No job found with id ${input.jobId} in this organization.`;

      const changeOrder = await createChangeOrder({
        organizationId: ctx.organizationId,
        jobId: job.id,
        title: input.title,
        mode: ChangeOrderMode.FLAT,
        flatCostCodeId: input.costCodeId,
        flatCostCents: parseDollarsToCents(input.costDollars),
        flatClientPriceCents: parseDollarsToCents(input.clientPriceDollars),
      });
      return `Created DRAFT change order "${changeOrder.title}" (${formatMoney(input.clientPriceDollars * 100)}) for ${job.name}. It's internal only — a human needs to send it for client approval before it goes anywhere.`;
    },
  });

  const logDailyLogNote = betaZodTool({
    name: "log_daily_log_note",
    description:
      "Add a daily log field note for a job. Created as NOT client-visible by default, even though the daily-log page itself defaults new entries to client-visible — a human can flip that toggle after reviewing it.",
    inputSchema: z.object({
      jobId: z.string().describe("The job's id, from list_jobs"),
      note: z.string().describe("The field note text"),
    }),
    run: async (input) => {
      const job = await requireJob(ctx.organizationId, input.jobId);
      if (!job) return `No job found with id ${input.jobId} in this organization.`;

      await createDailyLog({
        organizationId: ctx.organizationId,
        jobId: job.id,
        authorUserId: ctx.userId,
        note: input.note,
        clientVisible: false,
      });
      return `Logged a daily log note for ${job.name} (not client-visible yet).`;
    },
  });

  const createRfiTool = betaZodTool({
    name: "create_rfi",
    description: "Create a new RFI (request for information) for a job — an internal question that needs an answer.",
    inputSchema: z.object({
      jobId: z.string().describe("The job's id, from list_jobs"),
      title: z.string().describe("Short RFI title"),
      question: z.string().describe("The question being asked"),
    }),
    run: async (input) => {
      const job = await requireJob(ctx.organizationId, input.jobId);
      if (!job) return `No job found with id ${input.jobId} in this organization.`;

      await createRfi({ organizationId: ctx.organizationId, jobId: job.id, title: input.title, question: input.question });
      return `Created RFI "${input.title}" for ${job.name}.`;
    },
  });

  const createTodoTool = betaZodTool({
    name: "create_todo",
    description: "Create a to-do/task for a job. Created as NOT client-visible.",
    inputSchema: z.object({
      jobId: z.string().describe("The job's id, from list_jobs"),
      title: z.string().describe("The task title"),
      description: z.string().optional().describe("More detail on the task"),
      priority: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
      dueDate: z.string().optional().describe("Due date as an ISO date string, e.g. 2026-09-15"),
    }),
    run: async (input) => {
      const job = await requireJob(ctx.organizationId, input.jobId);
      if (!job) return `No job found with id ${input.jobId} in this organization.`;

      await createTodo({
        organizationId: ctx.organizationId,
        jobId: job.id,
        title: input.title,
        description: input.description ?? null,
        priority: input.priority,
        dueDate: input.dueDate ? new Date(input.dueDate) : null,
        clientVisible: false,
      });
      return `Created task "${input.title}" for ${job.name}${input.dueDate ? `, due ${formatDate(new Date(input.dueDate))}` : ""}.`;
    },
  });

  // --- CONFIRM: client-facing or money-moving — queue only, never execute -----

  const sendInvoiceTool = betaZodTool({
    name: "send_invoice",
    description:
      "Queue the next draft invoice for a job to be sent to the client. This does NOT actually send anything — it only queues the action for the user to explicitly confirm in the chat UI, since sending an invoice is a client-facing, money-related action.",
    inputSchema: z.object({ jobId: z.string().describe("The job's id, from list_jobs") }),
    run: async (input) => {
      const job = await requireJob(ctx.organizationId, input.jobId);
      if (!job) return `No job found with id ${input.jobId} in this organization.`;

      const nextDraft = await db.invoice.findFirst({ where: { jobId: job.id, status: InvoiceStatus.DRAFT }, orderBy: { createdAt: "asc" } });
      if (!nextDraft) return `${job.name} has no draft invoices waiting to be sent.`;

      await createPendingAction({
        conversationId: ctx.conversationId,
        toolName: "send_invoice",
        input: { invoiceId: nextDraft.id },
        summary: `Send invoice ${nextDraft.invoiceNumber} (${formatMoney(nextDraft.amountCents)}) for ${job.name} to the client`,
      });
      return `Queued invoice ${nextDraft.invoiceNumber} (${formatMoney(nextDraft.amountCents)}) for ${job.name} for the user's confirmation. It has NOT been sent — tell the user to confirm it in the chat.`;
    },
  });

  const sendProposalTool = betaZodTool({
    name: "send_proposal",
    description:
      "Queue the most recent draft proposal for a job to be sent to the client. This does NOT actually send anything — it only queues the action for the user's explicit confirmation, since sending a proposal is client-facing.",
    inputSchema: z.object({ jobId: z.string().describe("The job's id, from list_jobs") }),
    run: async (input) => {
      const job = await requireJob(ctx.organizationId, input.jobId);
      if (!job) return `No job found with id ${input.jobId} in this organization.`;

      const draft = await db.proposal.findFirst({
        where: { jobId: job.id, status: ProposalStatus.DRAFT },
        orderBy: { createdAt: "desc" },
        select: { id: true, title: true },
      });
      if (!draft) return `${job.name} has no draft proposals waiting to be sent.`;

      await createPendingAction({
        conversationId: ctx.conversationId,
        toolName: "send_proposal",
        input: { proposalId: draft.id },
        summary: `Send proposal "${draft.title}" for ${job.name} to the client`,
      });
      return `Queued proposal "${draft.title}" for ${job.name} for the user's confirmation. It has NOT been sent — tell the user to confirm it in the chat.`;
    },
  });

  return [
    listJobs,
    listCostCodes,
    getJobOverview,
    getJobFinancialSummary,
    listOpenChangeOrders,
    findJobFiles,
    createChangeOrderDraft,
    logDailyLogNote,
    createRfiTool,
    createTodoTool,
    sendInvoiceTool,
    sendProposalTool,
  ];
}
