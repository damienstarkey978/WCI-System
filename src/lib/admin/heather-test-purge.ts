/**
 * Purge the specific test records Heather flagged on 2026-10-28 (vendors /
 * invoices / daily logs / lead proposals / inbound receipts) plus rewrite
 * job-style client contact names. Deliberately pattern-narrow so a real
 * "Test" subtrade name on a live PO is never swept up.
 */

import { db } from "@/lib/db";

import { findJobStyleClientNames, repairJobStyleClientNames, type ClientNameRepairPreview } from "./client-name-repair";

const TEST_VENDOR_NAMES = ["test company", "brandon sub test"] as const;

const TEST_INVOICE_NUMBER_RE = /^(TEST-INV-|TAXTEST-)/i;

const TEST_PROPOSAL_TITLE_RE = /^(TEST Jarvis|testing testing|placeholder$)/i;

const TEST_DAILY_LOG_NOTE_RE = /^testing$/i;
const TEST_DAILY_LOG_TITLE_RE = /^testing$/i;

const TEST_INBOUND_SUBJECT_RE = /^Test Receipt/i;

const PHILLIPS_JOB_NAME_RE = /10290\s+Phillips/i;

export interface HeatherPurgePreview {
  readonly vendors: readonly { id: string; name: string; email: string | null }[];
  readonly invoices: readonly { id: string; invoiceNumber: string; status: string; jobId: string }[];
  readonly dailyLogs: readonly { id: string; jobId: string; title: string | null; note: string }[];
  readonly proposals: readonly { id: string; title: string; status: string }[];
  readonly inboundEmails: readonly { id: string; subject: string | null; fromAddress: string }[];
  readonly clientNameRepairs: readonly ClientNameRepairPreview[];
}

export async function previewHeatherTestPurge(organizationId: string): Promise<HeatherPurgePreview> {
  const [vendors, invoices, proposals, inboundEmails, clientNameRepairs, phillipsJobs] = await Promise.all([
    db.vendor.findMany({
      where: {
        organizationId,
        OR: TEST_VENDOR_NAMES.map((name) => ({ name: { equals: name, mode: "insensitive" as const } })),
      },
      select: { id: true, name: true, email: true },
    }),
    db.invoice.findMany({
      where: {
        organizationId,
        OR: [{ invoiceNumber: { startsWith: "TEST-INV-", mode: "insensitive" } }, { invoiceNumber: { startsWith: "TAXTEST-", mode: "insensitive" } }],
      },
      select: { id: true, invoiceNumber: true, status: true, jobId: true },
    }),
    db.proposal.findMany({
      where: {
        organizationId,
        status: "DRAFT",
        OR: [
          { title: { startsWith: "TEST Jarvis", mode: "insensitive" } },
          { title: { startsWith: "testing testing", mode: "insensitive" } },
          { title: { equals: "placeholder", mode: "insensitive" } },
          { title: { equals: "testing testing placeholder", mode: "insensitive" } },
        ],
      },
      select: { id: true, title: true, status: true },
    }),
    db.inboundEmail.findMany({
      where: {
        organizationId,
        subject: { startsWith: "Test Receipt", mode: "insensitive" },
      },
      select: { id: true, subject: true, fromAddress: true },
    }),
    findJobStyleClientNames(organizationId),
    db.job.findMany({
      where: { organizationId, name: { contains: "Phillips", mode: "insensitive" } },
      select: { id: true, name: true },
    }),
  ]);

  const phillipsIds = phillipsJobs.filter((job) => PHILLIPS_JOB_NAME_RE.test(job.name)).map((job) => job.id);
  const dailyLogs =
    phillipsIds.length === 0
      ? []
      : await db.dailyLog.findMany({
          where: {
            organizationId,
            jobId: { in: phillipsIds },
            OR: [{ note: { equals: "Testing", mode: "insensitive" } }, { title: { equals: "Testing", mode: "insensitive" } }],
          },
          select: { id: true, jobId: true, title: true, note: true },
        });

  // Defensive filter in case Prisma mode quirks ever widen the invoice query.
  const safeInvoices = invoices.filter((row) => TEST_INVOICE_NUMBER_RE.test(row.invoiceNumber));
  const safeProposals = proposals.filter((row) => TEST_PROPOSAL_TITLE_RE.test(row.title.trim()));
  const safeInbound = inboundEmails.filter((row) => (row.subject ? TEST_INBOUND_SUBJECT_RE.test(row.subject) : false));
  const safeLogs = dailyLogs.filter(
    (row) => TEST_DAILY_LOG_NOTE_RE.test(row.note.trim()) || (row.title ? TEST_DAILY_LOG_TITLE_RE.test(row.title.trim()) : false),
  );

  return {
    vendors,
    invoices: safeInvoices,
    dailyLogs: safeLogs,
    proposals: safeProposals,
    inboundEmails: safeInbound,
    clientNameRepairs,
  };
}

export interface HeatherPurgeResult {
  readonly deletedVendors: number;
  readonly deletedInvoices: number;
  readonly deletedDailyLogs: number;
  readonly deletedProposals: number;
  readonly deletedInboundEmails: number;
  readonly repairedClientNames: number;
  readonly preview: HeatherPurgePreview;
  readonly skipped: readonly string[];
}

/**
 * Hard-delete the previewed test rows. Vendors with POs/bills are skipped (listed
 * in `skipped`) rather than cascading live financial history. Draft invoices with
 * payments are skipped the same way.
 */
export async function applyHeatherTestPurge(organizationId: string): Promise<HeatherPurgeResult> {
  const preview = await previewHeatherTestPurge(organizationId);
  const skipped: string[] = [];

  let deletedVendors = 0;
  for (const vendor of preview.vendors) {
    // PO/Bill FKs are onDelete: SetNull — safe to drop a test vendor even if a
    // scratch PO pointed at it. Cascade covers certifications / portal rows / bids.
    await db.vendor.delete({ where: { id: vendor.id } });
    deletedVendors += 1;
  }

  let deletedInvoices = 0;
  for (const invoice of preview.invoices) {
    // Explicit TEST-* invoices — wipe payments too. Payment.onDelete is Cascade from
    // Invoice, but delete payments first so a PARTIALLY_PAID test row still clears.
    await db.payment.deleteMany({ where: { invoiceId: invoice.id } });
    await db.invoiceLineItem.deleteMany({ where: { invoiceId: invoice.id } });
    await db.file.updateMany({ where: { invoiceId: invoice.id }, data: { invoiceId: null } });
    await db.invoice.delete({ where: { id: invoice.id } });
    deletedInvoices += 1;
  }

  let deletedDailyLogs = 0;
  for (const log of preview.dailyLogs) {
    await db.dailyLogLike.deleteMany({ where: { dailyLogId: log.id } });
    // Detach files rather than orphan-delete storage objects we don't own here.
    await db.file.updateMany({ where: { dailyLogId: log.id }, data: { dailyLogId: null } });
    await db.dailyLog.delete({ where: { id: log.id } });
    deletedDailyLogs += 1;
  }

  let deletedProposals = 0;
  for (const proposal of preview.proposals) {
    // Clear selectedOptionId first — it is a unique FK back into ProposalOption,
    // so the cascade delete of options would otherwise conflict with it.
    await db.proposal.update({ where: { id: proposal.id }, data: { selectedOptionId: null } });
    await db.proposal.delete({ where: { id: proposal.id } });
    deletedProposals += 1;
  }

  let deletedInboundEmails = 0;
  for (const email of preview.inboundEmails) {
    const billCount = await db.bill.count({ where: { inboundEmailId: email.id } });
    if (billCount > 0) {
      skipped.push(`inbound email "${email.subject}" (${email.id}): linked to ${billCount} bill(s) — left in place`);
      continue;
    }
    await db.inboundEmail.delete({ where: { id: email.id } });
    deletedInboundEmails += 1;
  }

  const { repaired } = await repairJobStyleClientNames(organizationId, { dryRun: false });

  return {
    deletedVendors,
    deletedInvoices,
    deletedDailyLogs,
    deletedProposals,
    deletedInboundEmails,
    repairedClientNames: repaired,
    preview,
    skipped,
  };
}
