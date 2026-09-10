/**
 * Proves the financial reports and the job costing screen tell the same story about
 * the same job — the invariant the reports service comment claims ("no report can
 * silently disagree with another about a job's numbers") but nothing checked.
 *
 * The case that broke it: a taxed invoice. Job costing strips sales tax from
 * amountInvoiced because tax is collected, not earned; the reports built their own
 * funnel and passed the raw total, so every taxed invoice moved the two apart.
 */
import { getJobBudget } from "../src/lib/budget/service";
import { getOverdueInvoices } from "../src/lib/reports/daily-brief";
import {
  getCashFlowReport,
  getInvoicingReport,
  getProfitabilityReport,
  getWipReport,
} from "../src/lib/reports/service";
import { createCreditMemo, issueCreditMemo, applyCreditMemo } from "../src/lib/invoicing/credits";
import { createInvoice, recordPayment, sendInvoice } from "../src/lib/invoicing/service";
import { db } from "../src/lib/db";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error("FAILED: " + msg);
  console.log("OK: " + msg);
}

async function main() {
  const org = await db.organization.findFirstOrThrow();
  const costCode = await db.costCode.findFirstOrThrow({ where: { organizationId: org.id, isActive: true } });
  const stamp = Date.now();

  const job = await db.job.create({
    data: { organizationId: org.id, name: `Report agreement ${stamp}`, contractType: "FIXED_PRICE", status: "OPEN" },
  });
  await db.budgetLine.create({
    data: {
      jobId: job.id,
      costCodeId: costCode.id,
      originalBudgetCostCents: 800_000,
      revisedBudgetCostCents: 800_000,
      originalClientPriceCents: 1_000_000,
      revisedClientPriceCents: 1_000_000,
    },
  });

  // $5,500 of work plus $300 of sales tax, of which $1,000 has been paid.
  const invoice = await createInvoice({
    organizationId: org.id,
    jobId: job.id,
    type: "LINE_ITEM",
    invoiceNumber: `AGR-${stamp}`,
    issuedOn: new Date("2026-07-01T00:00:00Z"),
    paymentTerms: "NET_30",
    taxRateBasisPoints: 750,
    lineItems: [
      { title: "Materials", amountCents: 400_000, taxable: true },
      { title: "Labor", amountCents: 150_000, taxable: false },
    ],
  });
  await sendInvoice(org.id, invoice.id);
  await recordPayment({ organizationId: org.id, invoiceId: invoice.id, method: "MANUAL", amountCents: 100_000 });

  const budget = await getJobBudget(job.id, org.id);
  const billed = budget.funnel.totals.amountInvoicedCents;
  assert(billed === 550_000, "job costing bills the work, not the tax");

  const [wip, profitability, invoicing, cashFlow] = await Promise.all([
    getWipReport(org.id),
    getProfitabilityReport(org.id),
    getInvoicingReport(org.id),
    getCashFlowReport(org.id),
  ]);

  const wipRow = wip.find((row) => row.jobId === job.id)!;
  const profitRow = profitability.find((row) => row.jobId === job.id)!;
  const invoicingRow = invoicing.find((row) => row.jobId === job.id)!;

  assert(wipRow.amountInvoicedCents === billed, "the WIP report agrees with job costing on amount invoiced");
  assert(
    invoicingRow.amountInvoicedCents === billed,
    "and so does the invoicing report — it was the tax that used to move them apart",
  );
  assert(
    invoicingRow.remainingToInvoiceCents === budget.funnel.totals.remainingToInvoiceCents,
    "remaining to invoice matches too",
  );
  assert(
    profitRow.revisedClientPriceCents === budget.funnel.totals.revisedClientPriceCents &&
      profitRow.projectedCostCents === budget.funnel.totals.projectedCostCents,
    "profitability reads the same contract price and projected cost",
  );
  assert(invoicingRow.totalPaidCents === 100_000, "payments are reported at what actually came in, tax included");

  // Cash flow is the one place the tax *should* show up on the way in: the client
  // paid it, so it is cash the business received, even though it isn't revenue.
  const today = new Date().toISOString().slice(0, 10);
  const todaysCashIn = cashFlow.historical.find((day: { date: string }) => day.date === today);
  assert(
    (todaysCashIn?.cashInCents ?? 0) >= 100_000,
    "cash flow counts the payment as cash in on the day it landed",
  );
  assert(
    cashFlow.projection.projectedCashInCents >= budget.funnel.totals.remainingToInvoiceCents,
    "and projects future cash in from the same remaining-to-invoice job costing reports",
  );

  // ---- The morning brief chases the balance, not the face value ---------------
  const overdueBefore = (await getOverdueInvoices(org.id)).find((row) => row.id === invoice.id)!;
  assert(
    overdueBefore.amountCents === 480_000,
    "an overdue invoice is chased for what is still owed ($4,800), not its $5,800 face value",
  );

  const memo = await createCreditMemo({
    organizationId: org.id,
    jobId: job.id,
    memoNumber: `AGRCM-${stamp}`,
    amountCents: 480_000,
    reason: "Settled by credit",
  });
  await issueCreditMemo(org.id, memo.id);
  await applyCreditMemo(org.id, memo.id, invoice.id);

  const overdueAfter = (await getOverdueInvoices(org.id)).find((row) => row.id === invoice.id);
  assert(!overdueAfter, "an invoice settled entirely by credit drops off the chase list");

  await db.creditMemo.deleteMany({ where: { jobId: job.id } });
  await db.payment.deleteMany({ where: { invoiceId: invoice.id } });
  await db.invoiceLineItem.deleteMany({ where: { invoiceId: invoice.id } });
  await db.invoice.deleteMany({ where: { jobId: job.id } });
  await db.budgetLine.deleteMany({ where: { jobId: job.id } });
  await db.job.delete({ where: { id: job.id } });

  console.log("\nReports and job costing verified to agree.");
  await db.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await db.$disconnect();
  process.exit(1);
});
