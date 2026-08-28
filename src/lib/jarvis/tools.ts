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

import { ChangeOrderMode, ChangeOrderStatus, InvoiceStatus, ProposalStatus, WarrantyClaimStatus } from "@/generated/prisma/enums";
import { formatCostCodeCatalog } from "@/lib/ai/estimate-draft";
import type { JarvisTool } from "@/lib/jarvis/assistant";
import { createBill } from "@/lib/bills/service";
import { createChangeOrder } from "@/lib/change-orders/service";
import { db } from "@/lib/db";
import { createDailyLog } from "@/lib/daily-logs/service";
import { resolveFileUrl } from "@/lib/files/service";
import { formatDate, formatMoney } from "@/lib/format";
import { createPendingAction } from "@/lib/jarvis/pending-actions";
import { parseDollarsToCents } from "@/lib/money";
import { createPurchaseOrder } from "@/lib/purchase-orders/service";
import { createRfi } from "@/lib/rfis/service";
import { addScheduleItem, createSchedule, getComputedSchedule } from "@/lib/scheduling/service";
import { createAllowance, createSelection } from "@/lib/selections/service";
import { createSubmittal } from "@/lib/submittals/service";
import { createTodo } from "@/lib/todos/service";
import { createWarrantyClaim, scheduleAppointment } from "@/lib/warranty/service";

export interface JarvisToolContext {
  readonly organizationId: string;
  readonly conversationId: string;
  readonly userId: string;
}

async function requireJob(organizationId: string, jobId: string) {
  return db.job.findFirst({ where: { id: jobId, organizationId }, select: { id: true, name: true, status: true } });
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
    sendInvoiceTool,
    sendProposalTool,
    approveSelectionOptionTool,
    advanceBillStatusTool,
  ];
}
