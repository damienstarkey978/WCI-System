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

import { Prisma } from "@/generated/prisma/client";
import { ChangeOrderMode, ChangeOrderStatus, ContractType, InvoiceStatus, JobStatus, MaterialVendor, ProposalStatus, UserRole, WarrantyClaimStatus } from "@/generated/prisma/enums";
import { AiNotConfiguredError, DraftGenerationError } from "@/lib/ai/estimate-assistant";
import { formatCostCodeCatalog } from "@/lib/ai/estimate-draft";
import {
  createAiChangeOrderDraft,
  createAiEstimateDraft,
  JobNotFoundError as AiDraftJobNotFoundError,
  JobNotOpenError as AiDraftJobNotOpenError,
  NoCostCodesError as AiDraftNoCostCodesError,
} from "@/lib/ai/service";
import type { JarvisImageInput, JarvisTool } from "@/lib/jarvis/assistant";
import { estimateTotalCents } from "@/lib/budget/funnel";
import { createBidPackage, lockBidSubmission } from "@/lib/bids/service";
import { createBill } from "@/lib/bills/service";
import { createChangeOrder } from "@/lib/change-orders/service";
import { createClient, grantJobAccess } from "@/lib/client-portal/service";
import { createVendor } from "@/lib/vendor-portal/service";
import { convertLeadToJob, createLead, createLeadActivity } from "@/lib/crm/service";
import { draftLeadProposalFromNotes } from "@/lib/crm/lead-proposal";
import { db } from "@/lib/db";
import {
  addProposalDraw,
  addProposalOption,
  addProposalSection,
  addProposalSectionBullet,
  declineProposal,
  deleteProposalDraw,
  deleteProposalSection,
  deleteProposalSectionBullet,
  EstimateJobMismatchError,
  EstimateNotFoundError,
  LastOptionError,
  ProposalDrawNotFoundError,
  ProposalDrawOverallocatedError,
  ProposalNotEditableError,
  ProposalNotFoundError,
  ProposalNotPendingError,
  ProposalOptionNotFoundError,
  ProposalSectionBulletNotFoundError,
  ProposalSectionNotFoundError,
  removeProposalOption,
  TooManyOptionsError,
  updateProposalBranding,
  updateProposalCoverMessage,
  updateProposalOptionLabel,
  updateProposalSectionBullet,
  updateProposalSectionTitle,
} from "@/lib/proposals/service";
import { createDailyLog } from "@/lib/daily-logs/service";
import { resolveFileUrlSafe } from "@/lib/files/service";
import { formatDate, formatMoney, formatPercent } from "@/lib/format";
import { transitionJobStatus } from "@/lib/jobs";
import { createPendingAction } from "@/lib/jarvis/pending-actions";
import { createMaterialCatalogItem, listMaterialCatalogItems, searchAndSaveWebPrice } from "@/lib/materials/service";
import { parseDollarsToCents } from "@/lib/money";
import { createPurchaseOrder } from "@/lib/purchase-orders/service";
import {
  getBillableMilestones,
  getCostInboxItems,
  getDailyBrief,
  getOverdueInvoices,
  getProposalsNeedingFollowUp,
} from "@/lib/reports/daily-brief";
import { getBudgetedVsProjectedReport, getCashFlowReport, getInvoicingReport, getLaborReport, getProfitabilityReport, getWipReport } from "@/lib/reports/service";
import { createRfi } from "@/lib/rfis/service";
import { addScheduleItem, createSchedule, getComputedSchedule } from "@/lib/scheduling/service";
import { createAllowance, createSelection } from "@/lib/selections/service";
import { generateSpecificationFromEstimate } from "@/lib/specifications/service";
import { createSubmittal } from "@/lib/submittals/service";
import { createSurvey } from "@/lib/surveys/service";
import { listStaffMembers } from "@/lib/staff/service";
import { workedHours } from "@/lib/time-clock/hours";
import { createTodo } from "@/lib/todos/service";
import { createWarrantyClaim, scheduleAppointment } from "@/lib/warranty/service";
import { createWeeklySummary } from "@/lib/ai/weekly-summary-service";
import { emitEvent } from "@/lib/webhooks";

export interface JarvisToolContext {
  readonly organizationId: string;
  readonly conversationId: string;
  readonly userId: string;
  /** Photos attached to the *current* turn (same ones given to the model as vision
   *  input — see runJarvisTurn) — so a tool like draft_lead_proposal can forward them
   *  into the actual estimate-drafting AI call for real photo grounding, not just let
   *  the chat model describe them secondhand in its "notes" argument. */
  readonly images?: readonly JarvisImageInput[];
}

async function requireJob(organizationId: string, jobId: string) {
  return db.job.findFirst({ where: { id: jobId, organizationId }, select: { id: true, name: true, status: true } });
}

/**
 * Staff account management (invite/role-change/deactivate) is restricted to admins,
 * the same as the one other role-gated action in this codebase
 * (requireRole(UserRole.ADMIN) on the batch-import route) — never trust the chat
 * session alone. Returns a decline message if the calling user isn't an admin, or
 * null to proceed. Re-checked again at confirm time in pending-actions.ts.
 */
async function requireAdminUser(ctx: JarvisToolContext): Promise<string | null> {
  const user = await db.user.findFirst({ where: { id: ctx.userId, organizationId: ctx.organizationId }, select: { role: true } });
  if (!user || user.role !== UserRole.ADMIN) {
    return "Only an admin can manage staff accounts — this wasn't queued.";
  }
  return null;
}

/** A short, human-readable reference number for records Jarvis creates that need one (PO/bill/claim numbers). */
function generateReferenceNumber(prefix: string): string {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}`;
}

async function getOrCreateSchedule(organizationId: string, jobId: string) {
  const existing = await db.schedule.findFirst({ where: { jobId }, select: { id: true } });
  if (existing) return existing;
  return createSchedule({ organizationId, jobId });
}

/** Every proposal-editing tool below hits the same handful of "can't do that" cases
 *  (not found, not a DRAFT anymore, etc.) — collected here so each tool's catch block
 *  is one line instead of repeating the same nine instanceof checks. */
function proposalEditErrorMessage(error: unknown): string | null {
  if (
    error instanceof ProposalNotFoundError ||
    error instanceof ProposalNotEditableError ||
    error instanceof ProposalSectionNotFoundError ||
    error instanceof ProposalSectionBulletNotFoundError ||
    error instanceof ProposalOptionNotFoundError ||
    error instanceof ProposalDrawNotFoundError ||
    error instanceof ProposalDrawOverallocatedError ||
    error instanceof EstimateNotFoundError ||
    error instanceof EstimateJobMismatchError ||
    error instanceof LastOptionError ||
    error instanceof TooManyOptionsError
  ) {
    return error.message;
  }
  return null;
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
        files.map(async (file) => {
          const url = await resolveFileUrlSafe(file.url);
          // Saying so beats failing the whole tool call over one bad row.
          return `${file.fileName}: ${url ?? "(file unavailable in storage)"}`;
        }),
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

  const draftEstimateWithAiTool = betaZodTool({
    name: "draft_estimate_with_ai",
    description:
      "Give Jarvis the scope of work, measurements, and notes for a job, and it drafts a full cost-coded estimate against the job's real cost code and materials catalog — created as DRAFT, never locked and never sent to Budget. Reuses the same estimate-drafting pipeline as the Estimates page and the Lead Proposal flow. Pass the job's id from list_jobs.",
    inputSchema: z.object({
      jobId: z.string().describe("The job's id, from list_jobs"),
      notes: z.string().describe("Scope of work, measurements, materials, anything relevant"),
    }),
    run: async (input) => {
      try {
        const result = await createAiEstimateDraft({
          organizationId: ctx.organizationId,
          jobId: input.jobId,
          notes: input.notes,
          images: ctx.images,
        });
        return `Drafted estimate "${result.title}" (id: ${result.estimateId}) with ${result.lineItemCount} line item${result.lineItemCount === 1 ? "" : "s"} — status DRAFT, view it in the job's Estimates tab. A human needs to review it before it's sent to Budget. Pass this id to add_proposal_option to offer it as a priced option on a job-based proposal.`;
      } catch (error) {
        if (error instanceof AiNotConfiguredError) return "The AI assistant isn't configured — ANTHROPIC_API_KEY isn't set.";
        if (error instanceof AiDraftJobNotFoundError) return `No job found with id ${input.jobId} in this organization.`;
        if (error instanceof AiDraftNoCostCodesError || error instanceof DraftGenerationError) return error.message;
        throw error;
      }
    },
  });

  const draftChangeOrderWithAiTool = betaZodTool({
    name: "draft_change_order_with_ai",
    description:
      "Give Jarvis a description of what changed — added scope, a client request, a field condition — for a job, and it drafts a full ITEMIZED change order against the job's real cost code catalog, reusing the same estimate-drafting pipeline. Created as DRAFT — approving it (the step that actually touches the Budget) is still a separate human action. Pass the job's id from list_jobs.",
    inputSchema: z.object({
      jobId: z.string().describe("The job's id, from list_jobs"),
      title: z.string().describe("What the change order is for, e.g. 'Add egress window to basement bedroom'"),
      notes: z.string().describe("What changed and why — measurements, materials, anything relevant"),
    }),
    run: async (input) => {
      try {
        const result = await createAiChangeOrderDraft({
          organizationId: ctx.organizationId,
          jobId: input.jobId,
          title: input.title,
          notes: input.notes,
          images: ctx.images,
        });
        return `Drafted change order "${result.title}" with ${result.lineItemCount} line item${result.lineItemCount === 1 ? "" : "s"} — status DRAFT, view it in the job's Change Orders tab. A human needs to review and approve it before it touches the Budget.`;
      } catch (error) {
        if (error instanceof AiNotConfiguredError) return "The AI assistant isn't configured — ANTHROPIC_API_KEY isn't set.";
        if (error instanceof AiDraftJobNotFoundError) return `No job found with id ${input.jobId} in this organization.`;
        if (error instanceof AiDraftJobNotOpenError || error instanceof AiDraftNoCostCodesError || error instanceof DraftGenerationError) {
          return error.message;
        }
        throw error;
      }
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

  // --- AUTO: Selections & Allowances -------------------------------------------

  const listSelectionsForJob = betaZodTool({
    name: "list_selections_for_job",
    description: "List a job's selections and their options with pricing and decision status. Pass the job's id from list_jobs.",
    inputSchema: z.object({ jobId: z.string().describe("The job's id, from list_jobs") }),
    run: async (input) => {
      const job = await requireJob(ctx.organizationId, input.jobId);
      if (!job) return `No job found with id ${input.jobId} in this organization.`;

      const selections = await db.selection.findMany({
        where: { jobId: job.id },
        select: { id: true, title: true, options: { select: { id: true, title: true, clientPriceCents: true, status: true } } },
        orderBy: { createdAt: "desc" },
      });
      if (selections.length === 0) return `${job.name} has no selections yet.`;
      return selections
        .map(
          (selection) =>
            `${selection.id} | ${selection.title}\n` +
            selection.options.map((option) => `  - ${option.id} | ${option.title} | ${formatMoney(option.clientPriceCents)} | ${option.status}`).join("\n"),
        )
        .join("\n");
    },
  });

  const createAllowanceTool = betaZodTool({
    name: "create_allowance",
    description: "Create a budget allowance for a job (e.g. a $2,000 lighting fixtures allowance). Call list_cost_codes first to get a valid costCodeId.",
    inputSchema: z.object({
      jobId: z.string().describe("The job's id, from list_jobs"),
      title: z.string().describe("What the allowance is for, e.g. 'Lighting fixtures allowance'"),
      costCodeId: z.string().describe("A cost code id from list_cost_codes"),
      costDollars: z.number().positive().describe("WCI's budgeted cost for the allowance, in dollars"),
      clientPriceDollars: z.number().positive().describe("The price charged to the client for the allowance, in dollars"),
    }),
    run: async (input) => {
      const job = await requireJob(ctx.organizationId, input.jobId);
      if (!job) return `No job found with id ${input.jobId} in this organization.`;

      await createAllowance({
        organizationId: ctx.organizationId,
        jobId: job.id,
        costCodeId: input.costCodeId,
        title: input.title,
        amountCents: parseDollarsToCents(input.costDollars),
        clientPriceCents: parseDollarsToCents(input.clientPriceDollars),
      });
      return `Created allowance "${input.title}" (${formatMoney(input.clientPriceDollars * 100)}) for ${job.name}.`;
    },
  });

  const createSelectionTool = betaZodTool({
    name: "create_selection",
    description:
      "Create a selection for a job with 2 or more options for the client to choose between (e.g. three tile options for a bathroom floor). Optionally link it to an allowance from create_allowance.",
    inputSchema: z.object({
      jobId: z.string().describe("The job's id, from list_jobs"),
      title: z.string().describe("What the client is selecting, e.g. 'Kitchen backsplash tile'"),
      allowanceId: z.string().optional().describe("An allowance id to link this selection to, if any"),
      options: z
        .array(
          z.object({
            title: z.string().describe("The option's name, e.g. 'Subway tile, white'"),
            priceDollars: z.number().nonnegative().describe("WCI's cost for this option, in dollars"),
            clientPriceDollars: z.number().nonnegative().describe("The price shown to the client for this option, in dollars"),
          }),
        )
        .min(2)
        .describe("At least two options for the client to choose between"),
    }),
    run: async (input) => {
      const job = await requireJob(ctx.organizationId, input.jobId);
      if (!job) return `No job found with id ${input.jobId} in this organization.`;

      const selection = await createSelection({
        organizationId: ctx.organizationId,
        jobId: job.id,
        allowanceId: input.allowanceId ?? null,
        title: input.title,
        options: input.options.map((option) => ({
          title: option.title,
          priceCents: parseDollarsToCents(option.priceDollars),
          clientPriceCents: parseDollarsToCents(option.clientPriceDollars),
        })),
      });
      return `Created selection "${selection.title}" for ${job.name} with ${input.options.length} options.`;
    },
  });

  // --- AUTO: Purchase Orders & Bills --------------------------------------------

  const listPurchaseOrdersForJob = betaZodTool({
    name: "list_purchase_orders_for_job",
    description: "List a job's purchase orders. Pass the job's id from list_jobs.",
    inputSchema: z.object({ jobId: z.string().describe("The job's id, from list_jobs") }),
    run: async (input) => {
      const job = await requireJob(ctx.organizationId, input.jobId);
      if (!job) return `No job found with id ${input.jobId} in this organization.`;

      const pos = await db.purchaseOrder.findMany({
        where: { jobId: job.id },
        select: { id: true, poNumber: true, vendorName: true, status: true },
        orderBy: { createdAt: "desc" },
        take: 20,
      });
      if (pos.length === 0) return `${job.name} has no purchase orders yet.`;
      return pos.map((po) => `${po.id} | ${po.poNumber} | ${po.vendorName} | ${po.status}`).join("\n");
    },
  });

  const createPurchaseOrderDraft = betaZodTool({
    name: "create_purchase_order_draft",
    description:
      "Create a new DRAFT purchase order for a job with one line item — not yet approved or committed. Call list_cost_codes first to get a valid costCodeId.",
    inputSchema: z.object({
      jobId: z.string().describe("The job's id, from list_jobs"),
      vendorName: z.string().describe("The vendor's name"),
      title: z.string().describe("What this line item covers, e.g. 'Framing lumber package'"),
      costCodeId: z.string().describe("A cost code id from list_cost_codes"),
      quantity: z.number().positive().describe("Quantity of units"),
      unitCostDollars: z.number().positive().describe("Cost per unit, in dollars"),
    }),
    run: async (input) => {
      const job = await requireJob(ctx.organizationId, input.jobId);
      if (!job) return `No job found with id ${input.jobId} in this organization.`;

      const po = await createPurchaseOrder({
        organizationId: ctx.organizationId,
        jobId: job.id,
        poNumber: generateReferenceNumber("PO"),
        vendorName: input.vendorName,
        lineItems: [
          {
            costCodeId: input.costCodeId,
            title: input.title,
            quantityMilli: Math.round(input.quantity * 1_000),
            unitCostCents: parseDollarsToCents(input.unitCostDollars),
          },
        ],
      });
      return `Created DRAFT purchase order ${po.poNumber} (${formatMoney(po.totalCents)}) to ${input.vendorName} for ${job.name}.`;
    },
  });

  const listBillsForJob = betaZodTool({
    name: "list_bills_for_job",
    description: "List a job's bills with their approval status. Pass the job's id from list_jobs.",
    inputSchema: z.object({ jobId: z.string().describe("The job's id, from list_jobs") }),
    run: async (input) => {
      const job = await requireJob(ctx.organizationId, input.jobId);
      if (!job) return `No job found with id ${input.jobId} in this organization.`;

      const bills = await db.bill.findMany({
        where: { jobId: job.id },
        select: { id: true, billNumber: true, vendorName: true, approvalStatus: true },
        orderBy: { createdAt: "desc" },
        take: 20,
      });
      if (bills.length === 0) return `${job.name} has no bills yet.`;
      return bills.map((bill) => `${bill.id} | ${bill.billNumber ?? "(no number)"} | ${bill.vendorName} | ${bill.approvalStatus}`).join("\n");
    },
  });

  const createBillTool = betaZodTool({
    name: "create_bill",
    description:
      "Create a new bill for a job with one line item — created IN_REVIEW, not yet approved or paid. Call list_cost_codes first to get a valid costCodeId.",
    inputSchema: z.object({
      jobId: z.string().describe("The job's id, from list_jobs"),
      vendorName: z.string().describe("The vendor's name"),
      title: z.string().describe("What this line item is for"),
      costCodeId: z.string().describe("A cost code id from list_cost_codes"),
      amountDollars: z.number().positive().describe("The line item amount, in dollars"),
    }),
    run: async (input) => {
      const job = await requireJob(ctx.organizationId, input.jobId);
      if (!job) return `No job found with id ${input.jobId} in this organization.`;

      const bill = await createBill({
        organizationId: ctx.organizationId,
        jobId: job.id,
        vendorName: input.vendorName,
        lineItems: [{ costCodeId: input.costCodeId, title: input.title, amountCents: parseDollarsToCents(input.amountDollars) }],
      });
      return `Created bill (${formatMoney(bill.totalCents)}) from ${input.vendorName} for ${job.name}, status IN_REVIEW.`;
    },
  });

  // --- AUTO: Schedule ------------------------------------------------------------

  const getScheduleOverview = betaZodTool({
    name: "get_schedule_overview",
    description: "Get a job's schedule items with computed dates and the projected finish date. Pass the job's id from list_jobs.",
    inputSchema: z.object({ jobId: z.string().describe("The job's id, from list_jobs") }),
    run: async (input) => {
      const job = await requireJob(ctx.organizationId, input.jobId);
      if (!job) return `No job found with id ${input.jobId} in this organization.`;

      const schedule = await db.schedule.findFirst({ where: { jobId: job.id }, select: { id: true } });
      if (!schedule) return `${job.name} has no schedule yet.`;

      const computed = await getComputedSchedule(ctx.organizationId, schedule.id);
      if (computed.items.length === 0) return `${job.name}'s schedule has no items yet.`;
      return [
        ...computed.items.map(
          (item) => `${item.id} | ${item.title} | ${formatDate(item.startDate)} to ${formatDate(item.endDate)}${item.isCriticalPath ? " | critical path" : ""}`,
        ),
        `Projected finish: ${formatDate(computed.projectFinishDate)}`,
      ].join("\n");
    },
  });

  const addScheduleItemTool = betaZodTool({
    name: "add_schedule_item",
    description: "Add a new item to a job's schedule. Created as NOT client-visible by default. Creates the schedule itself if the job doesn't have one yet.",
    inputSchema: z.object({
      jobId: z.string().describe("The job's id, from list_jobs"),
      title: z.string().describe("The schedule item title, e.g. 'Rough electrical'"),
      durationDays: z.number().int().positive().describe("How many days this task takes"),
    }),
    run: async (input) => {
      const job = await requireJob(ctx.organizationId, input.jobId);
      if (!job) return `No job found with id ${input.jobId} in this organization.`;

      const schedule = await getOrCreateSchedule(ctx.organizationId, job.id);
      await addScheduleItem({
        organizationId: ctx.organizationId,
        scheduleId: schedule.id,
        title: input.title,
        durationDays: input.durationDays,
        clientVisible: false,
      });
      return `Added "${input.title}" (${input.durationDays} day${input.durationDays === 1 ? "" : "s"}) to ${job.name}'s schedule, not client-visible yet.`;
    },
  });

  // --- AUTO: Submittals ------------------------------------------------------------

  const listSubmittalsForJob = betaZodTool({
    name: "list_submittals_for_job",
    description: "List a job's submittals and their review status. Pass the job's id from list_jobs.",
    inputSchema: z.object({ jobId: z.string().describe("The job's id, from list_jobs") }),
    run: async (input) => {
      const job = await requireJob(ctx.organizationId, input.jobId);
      if (!job) return `No job found with id ${input.jobId} in this organization.`;

      const submittals = await db.submittal.findMany({
        where: { jobId: job.id },
        select: { id: true, title: true, type: true, status: true },
        orderBy: { createdAt: "desc" },
      });
      if (submittals.length === 0) return `${job.name} has no submittals yet.`;
      return submittals.map((s) => `${s.id} | ${s.title} | ${s.type} | ${s.status}`).join("\n");
    },
  });

  const createSubmittalTool = betaZodTool({
    name: "create_submittal",
    description:
      "Create a new submittal for a job for review (a material spec sheet or shop drawing). Needs a document URL — use find_job_files to get a real link to an existing file, or a URL the user gives you.",
    inputSchema: z.object({
      jobId: z.string().describe("The job's id, from list_jobs"),
      title: z.string().describe("The submittal title"),
      type: z.enum(["MATERIAL_SPEC", "SHOP_DRAWING"]),
      documentUrl: z.string().describe("A URL to the document being submitted"),
      notes: z.string().optional(),
    }),
    run: async (input) => {
      const job = await requireJob(ctx.organizationId, input.jobId);
      if (!job) return `No job found with id ${input.jobId} in this organization.`;

      await createSubmittal({
        organizationId: ctx.organizationId,
        jobId: job.id,
        title: input.title,
        type: input.type,
        documentUrl: input.documentUrl,
        notes: input.notes ?? null,
      });
      return `Created submittal "${input.title}" (${input.type}) for ${job.name}, status PENDING.`;
    },
  });

  // --- AUTO: Warranty Claims --------------------------------------------------------

  const listWarrantyClaimsForJob = betaZodTool({
    name: "list_warranty_claims_for_job",
    description: "List a job's open (not CLOSED) warranty claims. Pass the job's id from list_jobs.",
    inputSchema: z.object({ jobId: z.string().describe("The job's id, from list_jobs") }),
    run: async (input) => {
      const job = await requireJob(ctx.organizationId, input.jobId);
      if (!job) return `No job found with id ${input.jobId} in this organization.`;

      const claims = await db.warrantyClaim.findMany({
        where: { jobId: job.id, status: { not: WarrantyClaimStatus.CLOSED } },
        select: { id: true, claimNumber: true, title: true, status: true },
        orderBy: { createdAt: "desc" },
      });
      if (claims.length === 0) return `${job.name} has no open warranty claims.`;
      return claims.map((claim) => `${claim.id} | ${claim.claimNumber} | ${claim.title} | ${claim.status}`).join("\n");
    },
  });

  const createWarrantyClaimTool = betaZodTool({
    name: "create_warranty_claim",
    description: "Log a new warranty claim for a job.",
    inputSchema: z.object({
      jobId: z.string().describe("The job's id, from list_jobs"),
      title: z.string().describe("Short claim title, e.g. 'Leak under kitchen sink'"),
      description: z.string().describe("What the client reported"),
      submittedByName: z.string().optional(),
      submittedByEmail: z.string().optional(),
    }),
    run: async (input) => {
      const job = await requireJob(ctx.organizationId, input.jobId);
      if (!job) return `No job found with id ${input.jobId} in this organization.`;

      const claim = await createWarrantyClaim({
        organizationId: ctx.organizationId,
        jobId: job.id,
        claimNumber: generateReferenceNumber("WC"),
        title: input.title,
        description: input.description,
        submittedByName: input.submittedByName ?? null,
        submittedByEmail: input.submittedByEmail ?? null,
      });
      return `Logged warranty claim ${claim.claimNumber} — "${claim.title}" — for ${job.name}, status SUBMITTED.`;
    },
  });

  const scheduleWarrantyAppointmentTool = betaZodTool({
    name: "schedule_warranty_appointment",
    description: "Schedule an appointment for an existing warranty claim. Pass the claim's id from list_warranty_claims_for_job.",
    inputSchema: z.object({
      claimId: z.string().describe("The warranty claim's id, from list_warranty_claims_for_job"),
      appointmentAt: z.string().describe("The appointment date/time as an ISO string, e.g. 2026-09-15T14:00:00"),
    }),
    run: async (input) => {
      await scheduleAppointment({ organizationId: ctx.organizationId, claimId: input.claimId, appointmentAt: new Date(input.appointmentAt) });
      return `Scheduled the warranty appointment for ${formatDate(new Date(input.appointmentAt))}.`;
    },
  });

  // --- AUTO: Vendors & Bid Board ------------------------------------------------

  const listVendors = betaZodTool({
    name: "list_vendors",
    description: "List this organization's vendors with their id, name, and trade. Needed before inviting a vendor to bid.",
    inputSchema: z.object({}),
    run: async () => {
      const vendors = await db.vendor.findMany({
        where: { organizationId: ctx.organizationId },
        select: { id: true, name: true, tradeType: true },
        orderBy: { name: "asc" },
      });
      if (vendors.length === 0) return "This organization has no vendors yet.";
      return vendors.map((vendor) => `${vendor.id} | ${vendor.name} | ${vendor.tradeType ?? "no trade listed"}`).join("\n");
    },
  });

  const createVendorTool = betaZodTool({
    name: "create_vendor",
    description:
      "Create a new vendor/subcontractor record. This does NOT invite them to the vendor portal or notify them — it's just the record. Needed before inviting a vendor to bid or granting them job access.",
    inputSchema: z.object({
      name: z.string(),
      email: z.string().describe("Must be unique within this organization"),
      tradeType: z.string().optional().describe("e.g. Electrical, Plumbing, Framing"),
      phone: z.string().optional(),
      addressLine1: z.string().optional(),
      city: z.string().optional(),
      state: z.string().optional(),
      postalCode: z.string().optional(),
    }),
    run: async (input) => {
      const vendor = await createVendor({
        organizationId: ctx.organizationId,
        name: input.name,
        email: input.email,
        tradeType: input.tradeType ?? null,
        phone: input.phone ?? null,
        addressLine1: input.addressLine1 ?? null,
        city: input.city ?? null,
        state: input.state ?? null,
        postalCode: input.postalCode ?? null,
      });
      return `Created vendor "${vendor.name}" (${vendor.email}).`;
    },
  });

  const listBidPackagesForJob = betaZodTool({
    name: "list_bid_packages_for_job",
    description: "List a job's bid packages and their submissions. Pass the job's id from list_jobs.",
    inputSchema: z.object({ jobId: z.string().describe("The job's id, from list_jobs") }),
    run: async (input) => {
      const job = await requireJob(ctx.organizationId, input.jobId);
      if (!job) return `No job found with id ${input.jobId} in this organization.`;

      const packages = await db.bidPackage.findMany({
        where: { jobId: job.id },
        select: {
          id: true,
          title: true,
          status: true,
          submissions: { select: { id: true, status: true, totalCents: true, vendor: { select: { name: true } } } },
        },
        orderBy: { createdAt: "desc" },
      });
      if (packages.length === 0) return `${job.name} has no bid packages yet.`;
      return packages
        .map(
          (pkg) =>
            `${pkg.id} | ${pkg.title} | ${pkg.status}\n` +
            (pkg.submissions.length === 0
              ? "  (no submissions yet)"
              : pkg.submissions
                  .map((sub) => `  - ${sub.id} | ${sub.vendor.name} | ${sub.status}${sub.totalCents ? ` | ${formatMoney(sub.totalCents)}` : ""}`)
                  .join("\n")),
        )
        .join("\n");
    },
  });

  const createBidPackageTool = betaZodTool({
    name: "create_bid_package",
    description: "Create a new bid package for a job — invisible to vendors until you invite one with invite_vendor_to_bid.",
    inputSchema: z.object({
      jobId: z.string().describe("The job's id, from list_jobs"),
      title: z.string().describe("What the package covers, e.g. 'Electrical rough-in'"),
      description: z.string().optional(),
      dueDate: z.string().optional().describe("Bid due date as an ISO date string"),
    }),
    run: async (input) => {
      const job = await requireJob(ctx.organizationId, input.jobId);
      if (!job) return `No job found with id ${input.jobId} in this organization.`;

      const bidPackage = await createBidPackage({
        organizationId: ctx.organizationId,
        jobId: job.id,
        title: input.title,
        description: input.description ?? null,
        dueDate: input.dueDate ? new Date(input.dueDate) : null,
      });
      return `Created bid package "${bidPackage.title}" for ${job.name}, status OPEN. Nothing is visible to a vendor until you invite one.`;
    },
  });

  const lockBidSubmissionTool = betaZodTool({
    name: "lock_bid_submission",
    description: "Freeze a vendor's bid submission so it can no longer be edited. Pass the submission's id from list_bid_packages_for_job.",
    inputSchema: z.object({ bidSubmissionId: z.string().describe("The bid submission's id, from list_bid_packages_for_job") }),
    run: async (input) => {
      await lockBidSubmission(ctx.organizationId, input.bidSubmissionId);
      return "Locked the bid submission from further edits.";
    },
  });

  // --- AUTO: Leads & CRM ---------------------------------------------------------

  const listLeads = betaZodTool({
    name: "list_leads",
    description: "List this organization's leads with their id, name, and stage.",
    inputSchema: z.object({}),
    run: async () => {
      const leads = await db.lead.findMany({
        where: { organizationId: ctx.organizationId },
        select: { id: true, name: true, stage: true, convertedJobId: true },
        orderBy: { createdAt: "desc" },
        take: 50,
      });
      if (leads.length === 0) return "This organization has no leads yet.";
      return leads.map((lead) => `${lead.id} | ${lead.name} | ${lead.stage}${lead.convertedJobId ? " | already converted to a job" : ""}`).join("\n");
    },
  });

  const createLeadTool = betaZodTool({
    name: "create_lead",
    description: "Create a new lead (sales opportunity).",
    inputSchema: z.object({
      name: z.string().describe("The lead's name or the prospect's name"),
      email: z.string().optional(),
      phone: z.string().optional(),
      source: z.string().optional().describe("Where the lead came from, e.g. 'Referral', 'Website'"),
      notes: z.string().optional(),
    }),
    run: async (input) => {
      const lead = await createLead({
        organizationId: ctx.organizationId,
        name: input.name,
        email: input.email ?? null,
        phone: input.phone ?? null,
        source: input.source ?? null,
        notes: input.notes ?? null,
      });
      return `Created lead "${lead.name}", stage NEW.`;
    },
  });

  const logLeadActivityTool = betaZodTool({
    name: "log_lead_activity",
    description: "Log an activity (call, email, meeting, note, or task) against a lead. Pass the lead's id from list_leads.",
    inputSchema: z.object({
      leadId: z.string().describe("The lead's id, from list_leads"),
      type: z.enum(["CALL", "EMAIL", "MEETING", "NOTE", "TASK"]),
      note: z.string().describe("What happened or what needs to happen"),
      dueDate: z.string().optional().describe("For a TASK, when it's due, as an ISO date string"),
    }),
    run: async (input) => {
      await createLeadActivity({
        organizationId: ctx.organizationId,
        leadId: input.leadId,
        type: input.type,
        note: input.note,
        dueDate: input.dueDate ? new Date(input.dueDate) : null,
        createdByUserId: ctx.userId,
      });
      return `Logged a ${input.type.toLowerCase()} on the lead.`;
    },
  });

  const convertLeadToJobTool = betaZodTool({
    name: "convert_lead_to_job",
    description:
      "Convert a lead into a real job (PRE_SALE status) — no client-facing or money effect by itself. If the lead is already converted, returns the existing job. Pass the lead's id from list_leads.",
    inputSchema: z.object({
      leadId: z.string().describe("The lead's id, from list_leads"),
      jobName: z.string().describe("The new job's name"),
      contractType: z.enum(["FIXED_PRICE", "OPEN_BOOK"]).default("FIXED_PRICE"),
    }),
    run: async (input) => {
      const { job } = await convertLeadToJob(ctx.organizationId, input.leadId, {
        name: input.jobName,
        contractType: input.contractType as ContractType,
      });
      return `Converted the lead to job "${job.name}" (${job.id}), status PRE_SALE.`;
    },
  });

  const draftLeadProposalTool = betaZodTool({
    name: "draft_lead_proposal",
    description:
      "Give Jarvis the scope of work, measurements, and notes for a lead, and it drafts a full estimate + client-facing proposal narrative — created as DRAFT, never sent. Converts the lead to a job if not already converted, and creates/links a Client record with portal permissions provisioned (the client still can't log in until someone separately sends them a portal invite — this does not do that). Pass the lead's id from list_leads.",
    inputSchema: z.object({
      leadId: z.string().describe("The lead's id, from list_leads"),
      notes: z.string().describe("Scope of work, measurements, materials, anything relevant"),
      clientEmail: z.string().optional().describe("Falls back to the lead's own email if omitted"),
      clientPhone: z.string().optional(),
    }),
    run: async (input) => {
      const proposal = await draftLeadProposalFromNotes({
        organizationId: ctx.organizationId,
        leadId: input.leadId,
        userId: ctx.userId,
        notes: input.notes,
        images: ctx.images,
        clientEmail: input.clientEmail ?? null,
        clientPhone: input.clientPhone ?? null,
      });
      return `Drafted proposal "${proposal.title}" for the lead — status DRAFT, view it at /leads/proposals/${proposal.id}. A human needs to review and send it.`;
    },
  });

  // --- AUTO: Proposals (read + draft editing) ---------------------------------------

  const listProposalsTool = betaZodTool({
    name: "list_proposals",
    description:
      "List this organization's proposals, optionally filtered by lead, job, or status. Needed before reading or editing a specific proposal.",
    inputSchema: z.object({
      leadId: z.string().optional().describe("Filter to proposals for this lead, from list_leads"),
      jobId: z.string().optional().describe("Filter to proposals for this job, from list_jobs"),
      status: z.enum(["DRAFT", "SENT", "ACCEPTED", "DECLINED"]).optional(),
    }),
    run: async (input) => {
      const proposals = await db.proposal.findMany({
        where: {
          organizationId: ctx.organizationId,
          ...(input.leadId ? { leadId: input.leadId } : {}),
          ...(input.jobId ? { jobId: input.jobId } : {}),
          ...(input.status ? { status: input.status as ProposalStatus } : {}),
        },
        orderBy: { createdAt: "desc" },
        select: { id: true, title: true, status: true, sentAt: true, createdAt: true, client: { select: { name: true } } },
      });
      if (proposals.length === 0) return "No proposals match that filter.";
      return proposals
        .map(
          (proposal) =>
            `${proposal.id} | ${proposal.title} | ${proposal.status} | ${proposal.client.name} | ${
              proposal.sentAt ? `sent ${formatDate(proposal.sentAt)}` : `drafted ${formatDate(proposal.createdAt)}`
            }`,
        )
        .join("\n");
    },
  });

  const getProposalTool = betaZodTool({
    name: "get_proposal",
    description:
      "Get full detail on one proposal: its priced options, narrative sections, payment schedule, and status history. Pass the id from list_proposals.",
    inputSchema: z.object({ proposalId: z.string().describe("The proposal's id, from list_proposals") }),
    run: async (input) => {
      const proposal = await db.proposal.findFirst({
        where: { id: input.proposalId, organizationId: ctx.organizationId },
        include: {
          client: { select: { name: true, email: true } },
          job: { select: { id: true, name: true } },
          lead: { select: { id: true, name: true } },
          options: { orderBy: { sortOrder: "asc" }, include: { estimate: { include: { lineItems: true } } } },
          sections: { orderBy: { sortOrder: "asc" }, include: { bullets: { orderBy: { sortOrder: "asc" } } } },
          draws: { orderBy: { sortOrder: "asc" } },
        },
      });
      if (!proposal) return `No proposal found with id ${input.proposalId} in this organization.`;

      const lines: string[] = [];
      lines.push(`"${proposal.title}" — status ${proposal.status}, client ${proposal.client.name} (${proposal.client.email})`);
      lines.push(
        proposal.job
          ? `Job: ${proposal.job.name} (${proposal.job.id})`
          : proposal.lead
            ? `Lead: ${proposal.lead.name} (${proposal.lead.id}), not yet a job`
            : "No job or lead linked.",
      );
      if (proposal.sentAt) lines.push(`Sent ${formatDate(proposal.sentAt)}.`);
      if (proposal.clientSignedAt) lines.push(`Signed by ${proposal.clientSignatureName} on ${formatDate(proposal.clientSignedAt)}.`);
      if (proposal.declinedAt) lines.push(`Declined ${formatDate(proposal.declinedAt)}.`);
      if (proposal.clientFeedback) lines.push(`Client feedback: "${proposal.clientFeedback}"`);
      if (proposal.coverMessage) lines.push(`Cover message: ${proposal.coverMessage}`);

      lines.push("", "Options:");
      for (const option of proposal.options) {
        const total = estimateTotalCents(option.estimate.lineItems);
        const selected = proposal.selectedOptionId === option.id ? " (selected)" : "";
        lines.push(`  ${option.id} | ${option.label} | ${formatMoney(total)}${selected} | estimate ${option.estimateId}`);
      }

      if (proposal.sections.length > 0) {
        lines.push("", "Sections:");
        for (const section of proposal.sections) {
          lines.push(`  ${section.id} | ${section.title}`);
          for (const bullet of section.bullets) lines.push(`    ${bullet.id} | ${bullet.text}`);
        }
      }

      if (proposal.draws.length > 0) {
        lines.push("", "Payment schedule:");
        for (const draw of proposal.draws) {
          lines.push(`  ${draw.id} | ${draw.title} | ${(draw.pctOfContractBasisPoints / 100).toFixed(2)}%`);
        }
      }

      return lines.join("\n");
    },
  });

  const updateProposalCoverMessageTool = betaZodTool({
    name: "update_proposal_cover_message",
    description: "Change the cover message on a DRAFT proposal — the note shown above the pricing when the client opens it. Pass the id from list_proposals.",
    inputSchema: z.object({ proposalId: z.string().describe("The proposal's id, from list_proposals"), coverMessage: z.string() }),
    run: async (input) => {
      try {
        await updateProposalCoverMessage(ctx.organizationId, input.proposalId, input.coverMessage);
        return "Updated the proposal's cover message.";
      } catch (error) {
        const message = proposalEditErrorMessage(error);
        if (message) return message;
        throw error;
      }
    },
  });

  const addProposalSectionTool = betaZodTool({
    name: "add_proposal_section",
    description: "Add a new narrative section (e.g. \"Scope of work\", \"What's included\") to a DRAFT proposal. Pass the id from list_proposals.",
    inputSchema: z.object({ proposalId: z.string().describe("The proposal's id, from list_proposals"), title: z.string() }),
    run: async (input) => {
      try {
        const section = await addProposalSection(ctx.organizationId, input.proposalId, input.title);
        return `Added section "${section.title}" (id: ${section.id}).`;
      } catch (error) {
        const message = proposalEditErrorMessage(error);
        if (message) return message;
        throw error;
      }
    },
  });

  const updateProposalSectionTitleTool = betaZodTool({
    name: "update_proposal_section_title",
    description: "Rename a section on a DRAFT proposal. Pass the section id from get_proposal.",
    inputSchema: z.object({ sectionId: z.string().describe("The section's id, from get_proposal"), title: z.string() }),
    run: async (input) => {
      try {
        await updateProposalSectionTitle(ctx.organizationId, input.sectionId, input.title);
        return `Renamed the section to "${input.title}".`;
      } catch (error) {
        const message = proposalEditErrorMessage(error);
        if (message) return message;
        throw error;
      }
    },
  });

  const deleteProposalSectionTool = betaZodTool({
    name: "delete_proposal_section",
    description: "Remove a section (and its bullets) from a DRAFT proposal. Pass the section id from get_proposal.",
    inputSchema: z.object({ sectionId: z.string().describe("The section's id, from get_proposal") }),
    run: async (input) => {
      try {
        await deleteProposalSection(ctx.organizationId, input.sectionId);
        return "Removed the section.";
      } catch (error) {
        const message = proposalEditErrorMessage(error);
        if (message) return message;
        throw error;
      }
    },
  });

  const addProposalSectionBulletTool = betaZodTool({
    name: "add_proposal_section_bullet",
    description: "Add a bullet point to a section on a DRAFT proposal. Pass the section id from get_proposal.",
    inputSchema: z.object({ sectionId: z.string().describe("The section's id, from get_proposal"), text: z.string() }),
    run: async (input) => {
      try {
        const bullet = await addProposalSectionBullet(ctx.organizationId, input.sectionId, input.text);
        return `Added bullet "${bullet.text}" (id: ${bullet.id}).`;
      } catch (error) {
        const message = proposalEditErrorMessage(error);
        if (message) return message;
        throw error;
      }
    },
  });

  const updateProposalSectionBulletTool = betaZodTool({
    name: "update_proposal_section_bullet",
    description: "Edit the text of one bullet on a DRAFT proposal. Pass the bullet id from get_proposal.",
    inputSchema: z.object({ bulletId: z.string().describe("The bullet's id, from get_proposal"), text: z.string() }),
    run: async (input) => {
      try {
        await updateProposalSectionBullet(ctx.organizationId, input.bulletId, input.text);
        return "Updated the bullet.";
      } catch (error) {
        const message = proposalEditErrorMessage(error);
        if (message) return message;
        throw error;
      }
    },
  });

  const deleteProposalSectionBulletTool = betaZodTool({
    name: "delete_proposal_section_bullet",
    description: "Remove one bullet from a DRAFT proposal. Pass the bullet id from get_proposal.",
    inputSchema: z.object({ bulletId: z.string().describe("The bullet's id, from get_proposal") }),
    run: async (input) => {
      try {
        await deleteProposalSectionBullet(ctx.organizationId, input.bulletId);
        return "Removed the bullet.";
      } catch (error) {
        const message = proposalEditErrorMessage(error);
        if (message) return message;
        throw error;
      }
    },
  });

  const addProposalOptionTool = betaZodTool({
    name: "add_proposal_option",
    description:
      "Offer another priced option (Good/Better/Best) on a DRAFT proposal, up to 5 total — using an estimate already drafted for the same job (from draft_estimate_with_ai). Only works on a proposal already tied to a real job; a lead-only proposal's estimate comes from draft_lead_proposal instead. Pass the proposal id from list_proposals and the estimate id from draft_estimate_with_ai.",
    inputSchema: z.object({
      proposalId: z.string().describe("The proposal's id, from list_proposals"),
      estimateId: z.string().describe("The estimate's id, from draft_estimate_with_ai — must belong to the same job as the proposal"),
      label: z.string().describe("e.g. \"Good\", \"Better\", \"Best\", or a descriptive name"),
    }),
    run: async (input) => {
      try {
        const option = await addProposalOption(ctx.organizationId, input.proposalId, { estimateId: input.estimateId, label: input.label });
        return `Added option "${option.label}" (id: ${option.id}) to the proposal.`;
      } catch (error) {
        const message = proposalEditErrorMessage(error);
        if (message) return message;
        throw error;
      }
    },
  });

  const updateProposalOptionLabelTool = betaZodTool({
    name: "update_proposal_option_label",
    description: "Rename an option on a DRAFT proposal (e.g. \"Option A\" -> \"Good\"). Pass the option id from get_proposal.",
    inputSchema: z.object({ optionId: z.string().describe("The option's id, from get_proposal"), label: z.string() }),
    run: async (input) => {
      try {
        await updateProposalOptionLabel(ctx.organizationId, input.optionId, input.label);
        return `Renamed the option to "${input.label}".`;
      } catch (error) {
        const message = proposalEditErrorMessage(error);
        if (message) return message;
        throw error;
      }
    },
  });

  const removeProposalOptionTool = betaZodTool({
    name: "remove_proposal_option",
    description: "Remove an option from a DRAFT proposal — refuses to leave zero options. Pass the option id from get_proposal.",
    inputSchema: z.object({ optionId: z.string().describe("The option's id, from get_proposal") }),
    run: async (input) => {
      try {
        await removeProposalOption(ctx.organizationId, input.optionId);
        return "Removed the option.";
      } catch (error) {
        const message = proposalEditErrorMessage(error);
        if (message) return message;
        throw error;
      }
    },
  });

  const updateProposalBrandingTool = betaZodTool({
    name: "update_proposal_branding",
    description: "Set the accent color and/or logo shown on a DRAFT proposal's client-facing review page. Pass the id from list_proposals.",
    inputSchema: z.object({
      proposalId: z.string().describe("The proposal's id, from list_proposals"),
      accentColor: z.string().optional().describe("A hex color, e.g. #1E3A8A"),
      logoUrl: z.string().optional(),
    }),
    run: async (input) => {
      try {
        await updateProposalBranding(ctx.organizationId, input.proposalId, { accentColor: input.accentColor, logoUrl: input.logoUrl });
        return "Updated the proposal's branding.";
      } catch (error) {
        const message = proposalEditErrorMessage(error);
        if (message) return message;
        throw error;
      }
    },
  });

  const addProposalDrawTool = betaZodTool({
    name: "add_proposal_draw",
    description:
      "Add a payment-schedule milestone (e.g. \"Deposit\", \"Rough-in complete\") to a DRAFT proposal, as a percent of whatever the contract ends up costing. The total across all milestones can't exceed 100%. On acceptance this becomes the job's real Draw Schedule. Pass the proposal id from list_proposals.",
    inputSchema: z.object({
      proposalId: z.string().describe("The proposal's id, from list_proposals"),
      title: z.string().describe("e.g. Deposit, Rough-in complete, Final"),
      percentOfContract: z.number().positive().max(100).describe("e.g. 10 for 10%"),
    }),
    run: async (input) => {
      try {
        const draw = await addProposalDraw(ctx.organizationId, input.proposalId, {
          title: input.title,
          pctOfContractBasisPoints: Math.round(input.percentOfContract * 100),
        });
        return `Added milestone "${draw.title}" (${(draw.pctOfContractBasisPoints / 100).toFixed(2)}%, id: ${draw.id}).`;
      } catch (error) {
        const message = proposalEditErrorMessage(error);
        if (message) return message;
        throw error;
      }
    },
  });

  const deleteProposalDrawTool = betaZodTool({
    name: "delete_proposal_draw",
    description: "Remove a payment-schedule milestone from a DRAFT proposal. Pass the milestone id from get_proposal.",
    inputSchema: z.object({ drawId: z.string().describe("The milestone's id, from get_proposal") }),
    run: async (input) => {
      try {
        await deleteProposalDraw(ctx.organizationId, input.drawId);
        return "Removed the milestone.";
      } catch (error) {
        const message = proposalEditErrorMessage(error);
        if (message) return message;
        throw error;
      }
    },
  });

  const declineProposalTool = betaZodTool({
    name: "decline_proposal",
    description:
      "Record that a SENT proposal was declined — e.g. the client said no over the phone. This just records the outcome; it doesn't notify anyone (WCI OS has no outbound email). Pass the id from list_proposals.",
    inputSchema: z.object({ proposalId: z.string().describe("The proposal's id, from list_proposals") }),
    run: async (input) => {
      try {
        const proposal = await declineProposal(ctx.organizationId, input.proposalId);
        return `Marked "${proposal.title}" as declined.`;
      } catch (error) {
        if (error instanceof ProposalNotFoundError || error instanceof ProposalNotPendingError) return error.message;
        throw error;
      }
    },
  });

  const acceptProposalTool = betaZodTool({
    name: "accept_proposal",
    description:
      "Queue accepting a SENT proposal on the client's behalf — e.g. they signed a paper copy or agreed verbally. This e-signs the proposal, opens (or converts the lead to) a real Job, sends the winning option's estimate to Budget, and copies its payment schedule onto the job — real money and contract consequences, so it does NOT execute immediately; it queues for the user's explicit confirmation. Pass the proposal id from list_proposals, and an optionId (from get_proposal) if the proposal has more than one option.",
    inputSchema: z.object({
      proposalId: z.string().describe("The proposal's id, from list_proposals"),
      optionId: z.string().optional().describe("Which option is winning — required if the proposal has more than one, from get_proposal"),
    }),
    run: async (input) => {
      const proposal = await db.proposal.findFirst({
        where: { id: input.proposalId, organizationId: ctx.organizationId },
        select: { id: true, title: true, status: true },
      });
      if (!proposal) return `No proposal found with id ${input.proposalId} in this organization.`;
      if (proposal.status !== ProposalStatus.SENT) {
        return `Proposal "${proposal.title}" is ${proposal.status}, not SENT — it can't be accepted from here.`;
      }

      await createPendingAction({
        conversationId: ctx.conversationId,
        toolName: "accept_proposal",
        input: { proposalId: input.proposalId, optionId: input.optionId },
        summary: `Accept proposal "${proposal.title}" — opens the job and sends the winning estimate to Budget`,
      });
      return `Queued accepting "${proposal.title}" for the user's confirmation. It has NOT been accepted yet — tell the user to confirm it in the chat.`;
    },
  });

  // --- AUTO: Jobs & Clients --------------------------------------------------------

  const createJobTool = betaZodTool({
    name: "create_job",
    description: "Start a brand-new job from scratch (not from a lead). Created as PRE_SALE.",
    inputSchema: z.object({
      name: z.string().describe("The job's name"),
      contractType: z.enum(["FIXED_PRICE", "OPEN_BOOK"]).default("FIXED_PRICE"),
      addressLine1: z.string().optional(),
      city: z.string().optional(),
      state: z.string().optional(),
      postalCode: z.string().optional(),
      sqft: z.number().int().positive().optional(),
    }),
    run: async (input) => {
      let job;
      try {
        job = await db.job.create({
          data: {
            organizationId: ctx.organizationId,
            name: input.name,
            contractType: input.contractType as ContractType,
            addressLine1: input.addressLine1 ?? null,
            city: input.city ?? null,
            state: input.state ?? null,
            postalCode: input.postalCode ?? null,
            sqft: input.sqft ?? null,
            status: JobStatus.PRE_SALE,
          },
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          return `Couldn't create the job — a job with that prefix already exists.`;
        }
        throw error;
      }

      await db.jobStatusEvent.create({ data: { jobId: job.id, from: null, to: JobStatus.PRE_SALE, actorUserId: ctx.userId } });
      await emitEvent(ctx.organizationId, "job.created", { jobId: job.id, prefix: job.prefix, name: job.name });
      return `Created job "${job.name}" (${job.id}), status PRE_SALE.`;
    },
  });

  const transitionJobStatusTool = betaZodTool({
    name: "transition_job_status",
    description:
      "Move a job to a new status: PRE_SALE -> OPEN or CLOSED; OPEN -> WARRANTY or CLOSED; WARRANTY -> OPEN or CLOSED; CLOSED -> OPEN. Reopening from WARRANTY or CLOSED requires the user to be an admin or PM — enforced the same way it would be for a human. Pass the job's id from list_jobs.",
    inputSchema: z.object({
      jobId: z.string().describe("The job's id, from list_jobs"),
      to: z.enum(["PRE_SALE", "OPEN", "WARRANTY", "CLOSED"]),
      reason: z.string().optional(),
    }),
    run: async (input) => {
      const user = await db.user.findFirst({ where: { id: ctx.userId, organizationId: ctx.organizationId }, select: { role: true } });
      if (!user) return "Couldn't find the current user to authorize this.";

      const job = await transitionJobStatus({
        jobId: input.jobId,
        organizationId: ctx.organizationId,
        to: input.to as JobStatus,
        actor: { kind: "user", userId: ctx.userId, role: user.role },
        reason: input.reason,
      });
      return `Moved job ${job.name} to ${job.status}.`;
    },
  });

  const listStaffTool = betaZodTool({
    name: "list_staff",
    description: "List this organization's staff — id, name, email, role, and whether they're active.",
    inputSchema: z.object({}),
    run: async () => {
      const staff = await listStaffMembers(ctx.organizationId);
      if (staff.length === 0) return "This organization has no staff yet.";
      return staff
        .map((member) => `${member.id} | ${member.name ?? "(no name)"} | ${member.email} | ${member.role}${member.isActive ? "" : " | INACTIVE"}`)
        .join("\n");
    },
  });

  const listClientsTool = betaZodTool({
    name: "list_clients",
    description: "List this organization's clients.",
    inputSchema: z.object({}),
    run: async () => {
      const clients = await db.client.findMany({
        where: { organizationId: ctx.organizationId },
        select: { id: true, name: true, email: true },
        orderBy: { name: "asc" },
        take: 50,
      });
      if (clients.length === 0) return "This organization has no clients yet.";
      return clients.map((client) => `${client.id} | ${client.name} | ${client.email}`).join("\n");
    },
  });

  const createClientTool = betaZodTool({
    name: "create_client",
    description: "Create a new client record. This does NOT invite them to the client portal or notify them — it's just the record.",
    inputSchema: z.object({
      name: z.string(),
      email: z.string().describe("Must be unique within this organization"),
      phone: z.string().optional(),
    }),
    run: async (input) => {
      const client = await createClient({ organizationId: ctx.organizationId, name: input.name, email: input.email, phone: input.phone ?? null });
      return `Created client "${client.name}" (${client.email}).`;
    },
  });

  const grantClientJobAccessTool = betaZodTool({
    name: "grant_client_job_access",
    description:
      "Give a client visibility/approval permissions on a job (daily logs, schedule, documents, budget, invoices, selections, change orders). This does NOT invite them to log in or notify them — access only becomes reachable once someone separately sends a portal invite. Pass ids from list_clients and list_jobs.",
    inputSchema: z.object({
      clientId: z.string().describe("The client's id, from list_clients"),
      jobId: z.string().describe("The job's id, from list_jobs"),
      canMakePayments: z.boolean().optional(),
      canApproveChangeOrders: z.boolean().optional(),
      canApproveSelections: z.boolean().optional(),
    }),
    run: async (input) => {
      await grantJobAccess({
        organizationId: ctx.organizationId,
        clientId: input.clientId,
        jobId: input.jobId,
        canViewDailyLogs: true,
        canViewSchedule: true,
        canViewDocuments: true,
        canViewBudget: true,
        canViewInvoices: true,
        canViewSelections: true,
        canViewChangeOrders: true,
        canMakePayments: input.canMakePayments ?? false,
        canApproveChangeOrders: input.canApproveChangeOrders ?? false,
        canApproveSelections: input.canApproveSelections ?? false,
      });
      return "Granted job access to the client. They still can't log in until someone sends a portal invite.";
    },
  });

  const getJobTimeSummary = betaZodTool({
    name: "get_job_time_summary",
    description: "Get total hours logged on a job, broken down by who logged them. Pass the job's id from list_jobs.",
    inputSchema: z.object({ jobId: z.string().describe("The job's id, from list_jobs") }),
    run: async (input) => {
      const job = await requireJob(ctx.organizationId, input.jobId);
      if (!job) return `No job found with id ${input.jobId} in this organization.`;

      const entries = await db.timeClockEntry.findMany({
        where: { jobId: job.id, organizationId: ctx.organizationId, clockOutAt: { not: null } },
        select: { clockInAt: true, clockOutAt: true, approvalStatus: true, user: { select: { name: true, email: true } }, breaks: true },
      });
      if (entries.length === 0) return `No completed time entries for ${job.name} yet.`;

      const hoursByUser = new Map<string, number>();
      for (const entry of entries) {
        const hours = workedHours(entry.clockInAt, entry.clockOutAt, entry.breaks);
        const label = entry.user.name ?? entry.user.email;
        hoursByUser.set(label, (hoursByUser.get(label) ?? 0) + hours);
      }
      const totalHours = [...hoursByUser.values()].reduce((sum, hours) => sum + hours, 0);

      return [
        `Total hours on ${job.name}: ${totalHours.toFixed(1)}`,
        ...[...hoursByUser.entries()].map(([name, hours]) => `  - ${name}: ${hours.toFixed(1)}h`),
      ].join("\n");
    },
  });

  const generateWeeklyClientUpdateTool = betaZodTool({
    name: "generate_weekly_client_update",
    description:
      "Generate an AI-written weekly progress summary for a job from its daily logs and schedule, for staff to review before sharing with the client (the client portal doesn't currently display these). Pass the job's id from list_jobs.",
    inputSchema: z.object({ jobId: z.string().describe("The job's id, from list_jobs") }),
    run: async (input) => {
      const job = await requireJob(ctx.organizationId, input.jobId);
      if (!job) return `No job found with id ${input.jobId} in this organization.`;

      const summary = await createWeeklySummary({ organizationId: ctx.organizationId, jobId: job.id });
      return `${summary.headline}\n\n${summary.body}`;
    },
  });

  // --- AUTO: Materials Catalog -----------------------------------------------------

  const listMaterials = betaZodTool({
    name: "list_materials",
    description: "List this organization's materials catalog — the AI estimate assistant's first-choice price source.",
    inputSchema: z.object({}),
    run: async () => {
      const items = await listMaterialCatalogItems(ctx.organizationId);
      if (items.length === 0) return "This organization has no materials catalog entries yet.";
      return items
        .map((item) => `${item.id} | ${item.vendor} | ${item.description} | ${formatMoney(item.unitCostCents)}/${item.unit} | ${item.source}`)
        .join("\n");
    },
  });

  const addMaterialTool = betaZodTool({
    name: "add_material",
    description: "Add a staff-verified material to the catalog with a known price.",
    inputSchema: z.object({
      description: z.string().describe("e.g. '2x6x8 SPF stud'"),
      vendor: z.enum(["LOWES", "HOME_DEPOT", "OTHER"]),
      unit: z.string().describe("e.g. EA, LF, SQFT, BAG"),
      unitCostDollars: z.number().positive(),
      category: z.string().optional(),
    }),
    run: async (input) => {
      const item = await createMaterialCatalogItem({
        organizationId: ctx.organizationId,
        vendor: input.vendor as MaterialVendor,
        description: input.description,
        unit: input.unit,
        unitCostCents: parseDollarsToCents(input.unitCostDollars),
        category: input.category ?? null,
      });
      return `Added "${item.description}" (${formatMoney(item.unitCostCents)}/${item.unit}) to the materials catalog, verified.`;
    },
  });

  const searchMaterialPriceOnlineTool = betaZodTool({
    name: "search_material_price_online",
    description:
      "Search the open web for a current price for a material not in the catalog (neither Lowe's nor Home Depot has a pricing API). Saves the result as an unverified entry for a human to confirm — never overwrites a staff-verified price.",
    inputSchema: z.object({
      description: z.string().describe("What to search for, e.g. '2x6x8 SPF stud'"),
      category: z.string().optional(),
    }),
    run: async (input) => {
      const item = await searchAndSaveWebPrice(ctx.organizationId, input.description, input.category ?? null);
      return `Found ${formatMoney(item.unitCostCents)}/${item.unit} from ${item.vendor} — saved as unverified. A human should confirm it before it's relied on.`;
    },
  });

  // --- AUTO: Reports -----------------------------------------------------------

  const getProfitabilityReportTool = betaZodTool({
    name: "get_profitability_report",
    description: "Get projected profit and margin across every active job, sorted worst-margin-first.",
    inputSchema: z.object({}),
    run: async () => {
      const rows = await getProfitabilityReport(ctx.organizationId);
      if (rows.length === 0) return "No active jobs to report on.";
      return rows
        .map((row) => `${row.jobName} | price ${formatMoney(row.revisedClientPriceCents)} | projected profit ${formatMoney(row.projectedProfitCents)} | margin ${formatPercent(row.projectedMarginBasisPoints)}`)
        .join("\n");
    },
  });

  const getWipReportTool = betaZodTool({
    name: "get_wip_report",
    description: "Get the work-in-progress (over/under billing) report across every active job.",
    inputSchema: z.object({}),
    run: async () => {
      const rows = await getWipReport(ctx.organizationId);
      if (rows.length === 0) return "No active jobs to report on.";
      return rows
        .map(
          (row) =>
            `${row.jobName} | ${formatPercent(row.percentCompleteBasisPoints)} complete | invoiced ${formatMoney(row.amountInvoicedCents)} | ${row.overUnderBillingCents >= 0 ? "overbilled" : "underbilled"} ${formatMoney(Math.abs(row.overUnderBillingCents))}`,
        )
        .join("\n");
    },
  });

  const getBudgetVsProjectedReportTool = betaZodTool({
    name: "get_budget_vs_projected_report",
    description: "Get every active job's revised budget vs. its currently projected cost — flags which jobs are running over budget.",
    inputSchema: z.object({}),
    run: async () => {
      const rows = await getBudgetedVsProjectedReport(ctx.organizationId);
      if (rows.length === 0) return "No active jobs to report on.";
      return rows
        .map(
          (row) =>
            `${row.jobName} | budget ${formatMoney(row.revisedBudgetCostCents)} | projected ${formatMoney(row.projectedCostCents)} | ${row.isOverBudget ? "OVER BUDGET by" : "under budget by"} ${formatMoney(Math.abs(row.varianceCents))}`,
        )
        .join("\n");
    },
  });

  const getInvoicingReportTool = betaZodTool({
    name: "get_invoicing_report",
    description: "Get every active job's invoiced-to-date, remaining-to-invoice, and total paid amounts.",
    inputSchema: z.object({}),
    run: async () => {
      const rows = await getInvoicingReport(ctx.organizationId);
      if (rows.length === 0) return "No active jobs to report on.";
      return rows
        .map(
          (row) =>
            `${row.jobName} | invoiced ${formatMoney(row.amountInvoicedCents)} | remaining to invoice ${formatMoney(row.remainingToInvoiceCents)} | paid ${formatMoney(row.totalPaidCents)}`,
        )
        .join("\n");
    },
  });

  const getLaborReportTool = betaZodTool({
    name: "get_labor_report",
    description: "Get every active job's budgeted vs. approved labor cost.",
    inputSchema: z.object({}),
    run: async () => {
      const rows = await getLaborReport(ctx.organizationId);
      if (rows.length === 0) return "No active jobs to report on.";
      return rows
        .map((row) => `${row.jobName} | budgeted labor ${formatMoney(row.budgetedLaborCostCents)} | approved labor ${formatMoney(row.approvedLaborCostCents)}`)
        .join("\n");
    },
  });

  const getCashFlowReportTool = betaZodTool({
    name: "get_cash_flow_report",
    description: "Get cash in (payments received) vs. cash out (bills paid) over a trailing window, default 30 days.",
    inputSchema: z.object({
      windowDays: z.number().int().positive().optional().describe("How many trailing days to cover — defaults to 30"),
    }),
    run: async (input) => {
      const report = await getCashFlowReport(ctx.organizationId, { windowDays: input.windowDays });
      const cashInCents = report.historical.reduce((total, day) => total + day.cashInCents, 0);
      const cashOutCents = report.historical.reduce((total, day) => total + day.cashOutCents, 0);
      return `Historical — cash in: ${formatMoney(cashInCents)} | cash out: ${formatMoney(cashOutCents)} | net: ${formatMoney(report.historicalNetCents)}. Projected — cash in: ${formatMoney(report.projection.projectedCashInCents)} | cash out: ${formatMoney(report.projection.projectedCashOutCents)}.`;
    },
  });

  // --- AUTO: Business Advisor (handoff.ai feature-parity pass) -----------------

  const getOverdueInvoicesTool = betaZodTool({
    name: "get_overdue_invoices",
    description: "List every invoice past its due date and not yet fully paid, across the whole organization.",
    inputSchema: z.object({}),
    run: async () => {
      const invoices = await getOverdueInvoices(ctx.organizationId);
      if (invoices.length === 0) return "No overdue invoices.";
      return invoices
        .map((invoice) => `${invoice.invoiceNumber} — ${invoice.jobName} — ${formatMoney(invoice.amountCents)}, due ${formatDate(invoice.dueOn)}`)
        .join("\n");
    },
  });

  const getProposalsNeedingFollowUpTool = betaZodTool({
    name: "get_proposals_needing_follow_up",
    description: "List proposals sent to a client 5+ days ago with no response yet (not accepted or declined).",
    inputSchema: z.object({}),
    run: async () => {
      const proposals = await getProposalsNeedingFollowUp(ctx.organizationId);
      if (proposals.length === 0) return "No proposals need follow-up right now.";
      return proposals.map((proposal) => `"${proposal.title}" — ${proposal.clientName} — sent ${formatDate(proposal.sentAt)}`).join("\n");
    },
  });

  const getBillableMilestonesTool = betaZodTool({
    name: "get_billable_milestones",
    description: "List draw-schedule milestones whose trigger date has passed but haven't been invoiced yet.",
    inputSchema: z.object({}),
    run: async () => {
      const milestones = await getBillableMilestones(ctx.organizationId);
      if (milestones.length === 0) return "No milestones are ready to bill right now.";
      return milestones.map((milestone) => `${milestone.title} — ${milestone.jobName}`).join("\n");
    },
  });

  const getCostInboxItemsTool = betaZodTool({
    name: "get_cost_inbox_items",
    description: "List AI-scanned bills still awaiting a human's approve/reject before they count toward any job's budget.",
    inputSchema: z.object({}),
    run: async () => {
      const items = await getCostInboxItems(ctx.organizationId);
      if (items.length === 0) return "The cost inbox is empty — nothing awaiting review.";
      return items.map((item) => `${item.vendorLabel} — ${item.jobName} — ${formatMoney(item.amountCents)}`).join("\n");
    },
  });

  const getDailyBriefTool = betaZodTool({
    name: "get_daily_brief",
    description:
      "Get the full 'what needs attention today' digest across the whole organization: overdue invoices, jobs over budget, unapproved timesheets, change orders pending approval, proposals needing follow-up, billable milestones, and the cost inbox. Use this for open-ended questions like 'what needs my attention' or 'how is my business looking today' — call the more specific report tools instead when the user asks about one thing in particular.",
    inputSchema: z.object({}),
    run: async () => {
      const brief = await getDailyBrief(ctx.organizationId);
      const lines: string[] = [];
      lines.push(
        brief.overdueInvoices.length === 0
          ? "Overdue invoices: none"
          : `Overdue invoices: ${brief.overdueInvoices.length} totaling ${formatMoney(brief.overdueInvoiceTotalCents)}`,
      );
      lines.push(brief.jobsOverBudget.length === 0 ? "Jobs over budget: none" : `Jobs over budget: ${brief.jobsOverBudget.map((job) => job.jobName).join(", ")}`);
      lines.push(brief.unapprovedShiftCount === 0 ? "Unapproved timesheets: none" : `Unapproved timesheets: ${brief.unapprovedShiftCount}`);
      lines.push(
        brief.pendingChangeOrderCount === 0 ? "Change orders pending approval: none" : `Change orders pending approval: ${brief.pendingChangeOrderCount}`,
      );
      lines.push(
        brief.proposalsNeedingFollowUp.length === 0
          ? "Proposals needing follow-up: none"
          : `Proposals needing follow-up: ${brief.proposalsNeedingFollowUp.map((proposal) => proposal.title).join(", ")}`,
      );
      lines.push(
        brief.billableMilestones.length === 0
          ? "Billable milestones ready: none"
          : `Billable milestones ready: ${brief.billableMilestones.map((milestone) => milestone.title).join(", ")}`,
      );
      lines.push(brief.costInboxItems.length === 0 ? "Cost inbox: empty" : `Cost inbox: ${brief.costInboxItems.length} bill(s) awaiting review`);
      return lines.join("\n");
    },
  });

  // --- AUTO: Specifications & Surveys -----------------------------------------------

  const generateSpecFromEstimateTool = betaZodTool({
    name: "generate_specification_from_estimate",
    description:
      "Auto-generate a specification document for a job from one of its estimates, one section per construction phase. Note: unlike daily logs/todos, a specification has no separate client-visibility toggle — if the client already has document access and is logged into the portal, they can see it as soon as it's created.",
    inputSchema: z.object({
      jobId: z.string().describe("The job's id, from list_jobs"),
      estimateId: z.string().describe("The estimate's id to generate from"),
      title: z.string().describe("The specification's title"),
    }),
    run: async (input) => {
      const spec = await generateSpecificationFromEstimate(ctx.organizationId, input.jobId, input.estimateId, input.title);
      return `Generated specification "${spec.title}" with ${spec.sections.length} sections.`;
    },
  });

  const createSurveyTool = betaZodTool({
    name: "create_survey",
    description: "Create a feedback survey for a job (pre-project, mid-project, or post-completion touchpoint) — internal until a human issues a response link to send out.",
    inputSchema: z.object({
      jobId: z.string().describe("The job's id, from list_jobs"),
      title: z.string(),
      touchpoint: z.enum(["PRE_PROJECT", "MID_PROJECT", "POST_COMPLETION"]),
      questions: z.array(z.string()).min(1).describe("The survey questions, in order"),
    }),
    run: async (input) => {
      const survey = await createSurvey({
        organizationId: ctx.organizationId,
        jobId: input.jobId,
        title: input.title,
        touchpoint: input.touchpoint,
        questions: input.questions.map((prompt) => ({ prompt })),
      });
      return `Created survey "${survey.title}" with ${survey.questions.length} questions. A human still needs to issue a response link to send it out.`;
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

  const approveSelectionOptionTool = betaZodTool({
    name: "approve_selection_option",
    description:
      "Queue approving one option of a selection — the client's final choice. This posts the cost/price difference onto the job's budget and declines every other option, so it does NOT execute immediately; it queues for the user's explicit confirmation. Pass ids from list_selections_for_job.",
    inputSchema: z.object({
      selectionId: z.string().describe("The selection's id, from list_selections_for_job"),
      optionId: z.string().describe("The chosen option's id, from list_selections_for_job"),
    }),
    run: async (input) => {
      const option = await db.selectionOption.findFirst({
        where: { id: input.optionId, selectionId: input.selectionId },
        select: { title: true, clientPriceCents: true, selection: { select: { title: true, job: { select: { name: true } } } } },
      });
      if (!option) return `No option ${input.optionId} found on selection ${input.selectionId}.`;

      await createPendingAction({
        conversationId: ctx.conversationId,
        toolName: "approve_selection_option",
        input: { selectionId: input.selectionId, optionId: input.optionId },
        summary: `Approve "${option.title}" (${formatMoney(option.clientPriceCents)}) for selection "${option.selection.title}" on ${option.selection.job.name}`,
      });
      return `Queued approving "${option.title}" for the user's confirmation. It has NOT been approved yet — tell the user to confirm it in the chat.`;
    },
  });

  const advanceBillStatusTool = betaZodTool({
    name: "advance_bill_status",
    description:
      "Queue moving a bill to a new approval status (APPROVED, READY_FOR_PAYMENT, PAID, or back to IN_REVIEW, or VOID). This does NOT execute immediately — every one of these moves money in the funnel, so it queues for the user's explicit confirmation. Pass the bill's id from list_bills_for_job.",
    inputSchema: z.object({
      billId: z.string().describe("The bill's id, from list_bills_for_job"),
      targetStatus: z.enum(["IN_REVIEW", "APPROVED", "READY_FOR_PAYMENT", "PAID", "VOID"]),
    }),
    run: async (input) => {
      const bill = await db.bill.findFirst({
        where: { id: input.billId, organizationId: ctx.organizationId },
        select: { billNumber: true, vendorName: true, approvalStatus: true, job: { select: { name: true } } },
      });
      if (!bill) return `No bill ${input.billId} found in this organization.`;

      await createPendingAction({
        conversationId: ctx.conversationId,
        toolName: "advance_bill_status",
        input: { billId: input.billId, targetStatus: input.targetStatus },
        summary: `Move bill ${bill.billNumber ?? bill.vendorName} on ${bill.job.name} from ${bill.approvalStatus} to ${input.targetStatus}`,
      });
      return `Queued moving the bill to ${input.targetStatus} for the user's confirmation. It has NOT changed yet — tell the user to confirm it in the chat.`;
    },
  });

  const inviteVendorToBidTool = betaZodTool({
    name: "invite_vendor_to_bid",
    description:
      "Queue inviting a vendor to bid on a package. This does NOT execute immediately — once invited, the vendor can see the package and submit a bid, so it's a real external-facing action that queues for the user's explicit confirmation. Pass ids from list_bid_packages_for_job and list_vendors.",
    inputSchema: z.object({
      bidPackageId: z.string().describe("The bid package's id, from list_bid_packages_for_job"),
      vendorId: z.string().describe("The vendor's id, from list_vendors"),
    }),
    run: async (input) => {
      const [bidPackage, vendor] = await Promise.all([
        db.bidPackage.findFirst({ where: { id: input.bidPackageId, organizationId: ctx.organizationId }, select: { title: true } }),
        db.vendor.findFirst({ where: { id: input.vendorId, organizationId: ctx.organizationId }, select: { name: true } }),
      ]);
      if (!bidPackage) return `No bid package found with id ${input.bidPackageId} in this organization.`;
      if (!vendor) return `No vendor found with id ${input.vendorId} in this organization.`;

      await createPendingAction({
        conversationId: ctx.conversationId,
        toolName: "invite_vendor_to_bid",
        input: { bidPackageId: input.bidPackageId, vendorId: input.vendorId },
        summary: `Invite ${vendor.name} to bid on "${bidPackage.title}"`,
      });
      return `Queued inviting ${vendor.name} to bid on "${bidPackage.title}" for the user's confirmation. They haven't been invited yet.`;
    },
  });

  const acceptBidSubmissionTool = betaZodTool({
    name: "accept_bid_submission",
    description:
      "Queue accepting a vendor's bid submission — the awarding decision on a subcontract. This does NOT execute immediately, and the decision is final once made. Pass the submission's id from list_bid_packages_for_job.",
    inputSchema: z.object({ bidSubmissionId: z.string().describe("The bid submission's id, from list_bid_packages_for_job") }),
    run: async (input) => {
      const submission = await db.bidSubmission.findFirst({
        where: { id: input.bidSubmissionId, bidPackage: { organizationId: ctx.organizationId } },
        select: { totalCents: true, vendor: { select: { name: true } }, bidPackage: { select: { title: true } } },
      });
      if (!submission) return `No bid submission found with id ${input.bidSubmissionId} in this organization.`;

      await createPendingAction({
        conversationId: ctx.conversationId,
        toolName: "accept_bid_submission",
        input: { bidSubmissionId: input.bidSubmissionId },
        summary: `Accept ${submission.vendor.name}'s bid on "${submission.bidPackage.title}"${submission.totalCents ? ` (${formatMoney(submission.totalCents)})` : ""}`,
      });
      return `Queued accepting ${submission.vendor.name}'s bid for the user's confirmation. It has NOT been accepted yet.`;
    },
  });

  const declineBidSubmissionTool = betaZodTool({
    name: "decline_bid_submission",
    description:
      "Queue declining a vendor's bid submission — final once made. This does NOT execute immediately. Pass the submission's id from list_bid_packages_for_job.",
    inputSchema: z.object({ bidSubmissionId: z.string().describe("The bid submission's id, from list_bid_packages_for_job") }),
    run: async (input) => {
      const submission = await db.bidSubmission.findFirst({
        where: { id: input.bidSubmissionId, bidPackage: { organizationId: ctx.organizationId } },
        select: { vendor: { select: { name: true } }, bidPackage: { select: { title: true } } },
      });
      if (!submission) return `No bid submission found with id ${input.bidSubmissionId} in this organization.`;

      await createPendingAction({
        conversationId: ctx.conversationId,
        toolName: "decline_bid_submission",
        input: { bidSubmissionId: input.bidSubmissionId },
        summary: `Decline ${submission.vendor.name}'s bid on "${submission.bidPackage.title}"`,
      });
      return `Queued declining ${submission.vendor.name}'s bid for the user's confirmation. It has NOT been declined yet.`;
    },
  });

  const awardBidPackageTool = betaZodTool({
    name: "award_bid_package",
    description:
      "Queue closing a bid package as AWARDED — marks the scope finalized. Requires at least one already-accepted submission. This does NOT execute immediately. Pass the package's id from list_bid_packages_for_job.",
    inputSchema: z.object({ bidPackageId: z.string().describe("The bid package's id, from list_bid_packages_for_job") }),
    run: async (input) => {
      const bidPackage = await db.bidPackage.findFirst({ where: { id: input.bidPackageId, organizationId: ctx.organizationId }, select: { title: true } });
      if (!bidPackage) return `No bid package found with id ${input.bidPackageId} in this organization.`;

      await createPendingAction({
        conversationId: ctx.conversationId,
        toolName: "award_bid_package",
        input: { bidPackageId: input.bidPackageId },
        summary: `Award and close bid package "${bidPackage.title}"`,
      });
      return `Queued awarding "${bidPackage.title}" for the user's confirmation. It has NOT been awarded yet.`;
    },
  });

  const pushBidToPurchaseOrderTool = betaZodTool({
    name: "push_bid_submission_to_purchase_order",
    description:
      "Queue creating a real purchase order from an ACCEPTED bid submission. This does NOT execute immediately — it creates a committed financial record, so it queues for the user's explicit confirmation. Pass the submission's id from list_bid_packages_for_job.",
    inputSchema: z.object({
      bidSubmissionId: z.string().describe("The bid submission's id, from list_bid_packages_for_job — must be ACCEPTED"),
      fallbackCostCodeId: z.string().optional().describe("A cost code id from list_cost_codes, used for any bid line item that doesn't already have one"),
    }),
    run: async (input) => {
      const submission = await db.bidSubmission.findFirst({
        where: { id: input.bidSubmissionId, bidPackage: { organizationId: ctx.organizationId } },
        select: { totalCents: true, vendor: { select: { name: true } }, bidPackage: { select: { title: true } } },
      });
      if (!submission) return `No bid submission found with id ${input.bidSubmissionId} in this organization.`;

      await createPendingAction({
        conversationId: ctx.conversationId,
        toolName: "push_bid_submission_to_purchase_order",
        input: { bidSubmissionId: input.bidSubmissionId, poNumber: generateReferenceNumber("PO"), fallbackCostCodeId: input.fallbackCostCodeId },
        summary: `Create a purchase order from ${submission.vendor.name}'s accepted bid on "${submission.bidPackage.title}"${submission.totalCents ? ` (${formatMoney(submission.totalCents)})` : ""}`,
      });
      return `Queued creating a purchase order from ${submission.vendor.name}'s bid for the user's confirmation. Nothing has been created yet.`;
    },
  });

  const inviteClientToPortalTool = betaZodTool({
    name: "invite_client_to_portal",
    description:
      "Queue inviting a client to log into the client portal — this actually activates a working login for them, unlike grant_client_job_access which only sets permissions. This does NOT execute immediately; it queues for the user's explicit confirmation. Pass the client's id from list_clients.",
    inputSchema: z.object({ clientId: z.string().describe("The client's id, from list_clients") }),
    run: async (input) => {
      const client = await db.client.findFirst({ where: { id: input.clientId, organizationId: ctx.organizationId }, select: { name: true, email: true } });
      if (!client) return `No client found with id ${input.clientId} in this organization.`;

      await createPendingAction({
        conversationId: ctx.conversationId,
        toolName: "invite_client_to_portal",
        input: { clientId: input.clientId },
        summary: `Invite ${client.name} (${client.email}) to log into the client portal`,
      });
      return `Queued inviting ${client.name} to the client portal for the user's confirmation. They haven't been invited yet.`;
    },
  });

  const inviteVendorToPortalTool = betaZodTool({
    name: "invite_vendor_to_portal",
    description:
      "Queue inviting a vendor to log into the vendor portal — this actually activates a working login for them. This does NOT execute immediately; it queues for the user's explicit confirmation. Pass the vendor's id from list_vendors.",
    inputSchema: z.object({ vendorId: z.string().describe("The vendor's id, from list_vendors") }),
    run: async (input) => {
      const vendor = await db.vendor.findFirst({ where: { id: input.vendorId, organizationId: ctx.organizationId }, select: { name: true, email: true } });
      if (!vendor) return `No vendor found with id ${input.vendorId} in this organization.`;

      await createPendingAction({
        conversationId: ctx.conversationId,
        toolName: "invite_vendor_to_portal",
        input: { vendorId: input.vendorId },
        summary: `Invite ${vendor.name} (${vendor.email}) to log into the vendor portal`,
      });
      return `Queued inviting ${vendor.name} to the vendor portal for the user's confirmation. They haven't been invited yet.`;
    },
  });

  const inviteStaffMemberTool = betaZodTool({
    name: "invite_staff_member",
    description:
      "Queue pre-authorizing a new staff member's email with a role — they get real access to this organization's data as soon as they sign in with that email, so this queues for the user's explicit confirmation rather than executing immediately. Admin-only. No invitation email is sent (WCI OS has no outbound email integration) — someone needs to tell them to sign in.",
    inputSchema: z.object({
      email: z.string().describe("Their email — must match what they sign in with"),
      name: z.string().optional(),
      title: z
        .string()
        .optional()
        .describe('Cosmetic display title, e.g. "Sales Rep" or "Org Owner" — purely for the staff directory, doesn\'t affect permissions'),
      role: z.enum(["ADMIN", "PM", "OFFICE", "FIELD"]),
    }),
    run: async (input) => {
      const denial = await requireAdminUser(ctx);
      if (denial) return denial;

      await createPendingAction({
        conversationId: ctx.conversationId,
        toolName: "invite_staff_member",
        input: { email: input.email, name: input.name ?? null, title: input.title ?? null, role: input.role },
        summary: `Pre-authorize ${input.email} as ${input.role}`,
      });
      return `Queued pre-authorizing ${input.email} as ${input.role} for the user's confirmation. Nothing has changed yet.`;
    },
  });

  const updateStaffRoleTool = betaZodTool({
    name: "update_staff_role",
    description:
      "Queue changing a staff member's role/permissions. This does NOT execute immediately — it queues for the user's explicit confirmation, since it changes what someone can access. Admin-only. Pass the staff member's id from list_staff.",
    inputSchema: z.object({
      userId: z.string().describe("The staff member's id, from list_staff"),
      role: z.enum(["ADMIN", "PM", "OFFICE", "FIELD"]),
    }),
    run: async (input) => {
      const denial = await requireAdminUser(ctx);
      if (denial) return denial;

      const staff = await db.user.findFirst({ where: { id: input.userId, organizationId: ctx.organizationId }, select: { email: true, role: true } });
      if (!staff) return `No staff member found with id ${input.userId} in this organization.`;

      await createPendingAction({
        conversationId: ctx.conversationId,
        toolName: "update_staff_role",
        input: { userId: input.userId, role: input.role },
        summary: `Change ${staff.email}'s role from ${staff.role} to ${input.role}`,
      });
      return `Queued changing ${staff.email}'s role to ${input.role} for the user's confirmation. Nothing has changed yet.`;
    },
  });

  const deactivateStaffMemberTool = betaZodTool({
    name: "deactivate_staff_member",
    description:
      "Queue deactivating a staff member — they immediately lose all access once this is confirmed. This does NOT execute immediately. Admin-only. Pass the staff member's id from list_staff.",
    inputSchema: z.object({ userId: z.string().describe("The staff member's id, from list_staff") }),
    run: async (input) => {
      const denial = await requireAdminUser(ctx);
      if (denial) return denial;

      const staff = await db.user.findFirst({ where: { id: input.userId, organizationId: ctx.organizationId }, select: { email: true } });
      if (!staff) return `No staff member found with id ${input.userId} in this organization.`;

      await createPendingAction({
        conversationId: ctx.conversationId,
        toolName: "deactivate_staff_member",
        input: { userId: input.userId },
        summary: `Deactivate ${staff.email} — they'll lose access immediately`,
      });
      return `Queued deactivating ${staff.email} for the user's confirmation. They still have access until it's confirmed.`;
    },
  });

  const reactivateStaffMemberTool = betaZodTool({
    name: "reactivate_staff_member",
    description:
      "Queue reactivating a deactivated staff member's access. This does NOT execute immediately. Admin-only. Pass the staff member's id from list_staff.",
    inputSchema: z.object({ userId: z.string().describe("The staff member's id, from list_staff") }),
    run: async (input) => {
      const denial = await requireAdminUser(ctx);
      if (denial) return denial;

      const staff = await db.user.findFirst({ where: { id: input.userId, organizationId: ctx.organizationId }, select: { email: true } });
      if (!staff) return `No staff member found with id ${input.userId} in this organization.`;

      await createPendingAction({
        conversationId: ctx.conversationId,
        toolName: "reactivate_staff_member",
        input: { userId: input.userId },
        summary: `Reactivate ${staff.email}'s access`,
      });
      return `Queued reactivating ${staff.email} for the user's confirmation.`;
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
    draftEstimateWithAiTool,
    draftChangeOrderWithAiTool,
    logDailyLogNote,
    createRfiTool,
    createTodoTool,
    listSelectionsForJob,
    createAllowanceTool,
    createSelectionTool,
    listPurchaseOrdersForJob,
    createPurchaseOrderDraft,
    listBillsForJob,
    createBillTool,
    getScheduleOverview,
    addScheduleItemTool,
    listSubmittalsForJob,
    createSubmittalTool,
    listWarrantyClaimsForJob,
    createWarrantyClaimTool,
    scheduleWarrantyAppointmentTool,
    listVendors,
    createVendorTool,
    listBidPackagesForJob,
    createBidPackageTool,
    lockBidSubmissionTool,
    sendInvoiceTool,
    sendProposalTool,
    acceptProposalTool,
    approveSelectionOptionTool,
    advanceBillStatusTool,
    inviteVendorToBidTool,
    acceptBidSubmissionTool,
    declineBidSubmissionTool,
    awardBidPackageTool,
    pushBidToPurchaseOrderTool,
    listLeads,
    createLeadTool,
    logLeadActivityTool,
    convertLeadToJobTool,
    draftLeadProposalTool,
    listProposalsTool,
    getProposalTool,
    updateProposalCoverMessageTool,
    addProposalSectionTool,
    updateProposalSectionTitleTool,
    deleteProposalSectionTool,
    addProposalSectionBulletTool,
    updateProposalSectionBulletTool,
    deleteProposalSectionBulletTool,
    addProposalOptionTool,
    updateProposalOptionLabelTool,
    removeProposalOptionTool,
    updateProposalBrandingTool,
    addProposalDrawTool,
    deleteProposalDrawTool,
    declineProposalTool,
    createJobTool,
    transitionJobStatusTool,
    listStaffTool,
    listClientsTool,
    createClientTool,
    grantClientJobAccessTool,
    getJobTimeSummary,
    generateWeeklyClientUpdateTool,
    listMaterials,
    addMaterialTool,
    searchMaterialPriceOnlineTool,
    getProfitabilityReportTool,
    getWipReportTool,
    getBudgetVsProjectedReportTool,
    getInvoicingReportTool,
    getLaborReportTool,
    getCashFlowReportTool,
    getOverdueInvoicesTool,
    getProposalsNeedingFollowUpTool,
    getBillableMilestonesTool,
    getCostInboxItemsTool,
    getDailyBriefTool,
    generateSpecFromEstimateTool,
    createSurveyTool,
    inviteClientToPortalTool,
    inviteVendorToPortalTool,
    inviteStaffMemberTool,
    updateStaffRoleTool,
    deactivateStaffMemberTool,
    reactivateStaffMemberTool,
  ];
}
