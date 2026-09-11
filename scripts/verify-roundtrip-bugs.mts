/**
 * The four bugs the production round-trip verification found on job
 * "10290 PHILLIPS HIGHWAY". Bug 1's case is reproduced exactly as reported: a $500
 * PO approved, a $500 bill paid against it, and $1,700 invoiced to the client, all on
 * one cost code with no BudgetLine.
 */
import { addBillToInvoice } from "../src/lib/bills/to-invoice";
import { getJobBudget } from "../src/lib/budget/service";
import { createInvoice, sendInvoice } from "../src/lib/invoicing/service";
import { computeInvoiceTotals } from "../src/lib/invoicing/terms";
import { db } from "../src/lib/db";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error("FAILED: " + msg);
  console.log("OK: " + msg);
}

async function main() {
  const org = await db.organization.findFirstOrThrow();
  const [paint, other] = await db.costCode.findMany({
    where: { organizationId: org.id, isActive: true },
    take: 2,
  });
  const stamp = Date.now();

  const job = await db.job.create({
    data: { organizationId: org.id, name: `Round trip ${stamp}`, contractType: "FIXED_PRICE", status: "OPEN" },
  });

  // ---- BUG 1: spend on a cost code with no BudgetLine --------------------
  await db.purchaseOrder.create({
    data: {
      organizationId: org.id, jobId: job.id, poNumber: `RT-PO-${stamp}`, vendorName: "Painter",
      status: "APPROVED",
      lineItems: { create: [{ costCodeId: paint.id, title: "Interior paint", quantityMilli: 1000, unitCostCents: 50_000 }] },
    },
  });
  const bill = await db.bill.create({
    data: {
      organizationId: org.id, jobId: job.id, vendorName: "Painter", approvalStatus: "PAID", paidAt: new Date(),
      lineItems: { create: [{ costCodeId: paint.id, title: "Interior paint", amountCents: 50_000 }] },
    },
  });

  const before = await getJobBudget(job.id, org.id);
  assert(before.funnel.lines.length === 1, "a cost code with spend but no budget line now produces a funnel line");

  const line = before.funnel.lines[0];
  assert(line.costCodeId === paint.id, "for the right cost code");
  assert(line.committedCostCents === 50_000, "the approved $500 PO shows as committed cost, not $0");
  assert(line.actualCostCents === 50_000, "the paid $500 bill shows as actual cost, not $0");
  assert(line.isUnbudgeted === true, "flagged as never budgeted");
  assert(before.costCodes[paint.id]?.code === paint.code, "and its cost code name resolves, so the row isn't blank");
  assert(
    before.funnel.totals.actualCostCents === 50_000,
    "the job total includes it too — this spend used to be missing from the totals entirely",
  );

  // A cancelled PO on another code shouldn't invent a zero row.
  await db.purchaseOrder.create({
    data: {
      organizationId: org.id, jobId: job.id, poNumber: `RT-CANCELLED-${stamp}`, vendorName: "Nobody",
      status: "CANCELLED",
      lineItems: { create: [{ costCodeId: other.id, title: "Nothing", quantityMilli: 1000, unitCostCents: 90_000 }] },
    },
  });
  const withCancelled = await getJobBudget(job.id, org.id);
  assert(withCancelled.funnel.lines.length === 1, "a code touched only by a cancelled PO stays off the grid as noise");

  // A real budget line still behaves exactly as before.
  await db.budgetLine.create({
    data: {
      jobId: job.id, costCodeId: other.id,
      originalBudgetCostCents: 100_000, revisedBudgetCostCents: 100_000,
      originalClientPriceCents: 120_000, revisedClientPriceCents: 120_000,
    },
  });
  const mixed = await getJobBudget(job.id, org.id);
  assert(mixed.funnel.lines.length === 2, "budgeted and unbudgeted lines appear together");
  assert(
    mixed.funnel.lines.find((l) => l.costCodeId === other.id)!.isUnbudgeted === false,
    "and a real budget line is not flagged unbudgeted",
  );

  // ---- BUG 4: invoicing with sales tax ------------------------------------
  const invoice = await createInvoice({
    organizationId: org.id, jobId: job.id, type: "LINE_ITEM",
    invoiceNumber: `RT-INV-${stamp}`, issuedOn: new Date(), taxRateBasisPoints: 750,
    lineItems: [
      { title: "Materials", amountCents: 100_000, taxable: true },
      { title: "Labor", amountCents: 70_000, taxable: false },
    ],
  });
  await sendInvoice(org.id, invoice.id);
  assert(invoice.taxCents === 7_500, "an invoice can now carry sales tax on its taxable lines only");
  assert(invoice.amountCents === 177_500, "with the tax included in the total");

  const invoiced = await getJobBudget(job.id, org.id);
  assert(
    invoiced.funnel.totals.amountInvoicedCents === 170_000,
    "and Job Costing's amount-invoiced excludes that tax — now actually testable",
  );

  // ---- BUG 3: markup reaching the invoice line ----------------------------
  const billable = await db.bill.create({
    data: {
      organizationId: org.id, jobId: job.id, vendorName: "Supplier", approvalStatus: "IN_REVIEW",
      lineItems: { create: [{ costCodeId: paint.id, title: "Materials", amountCents: 50_000 }] },
    },
  });
  const marked = await addBillToInvoice({ organizationId: org.id, billId: billable.id, markupBasisPoints: 2000 });
  const markedLines = await db.invoiceLineItem.findMany({ where: { invoiceId: marked.id } });
  assert(markedLines[0].amountCents === 60_000, "a 20% markup on a $500 bill reaches the client as $600");
  assert(markedLines[0].rateBasisPoints === 2000, "and the line records the 20%, not 0%");

  // The service was always right; the form's placeholder was the bug. Guard the
  // deliberate pass-through case so a future change can't turn 0 into 20 silently.
  const atCost = await addBillToInvoice({ organizationId: org.id, billId: bill.id, markupBasisPoints: 0 });
  const atCostLines = await db.invoiceLineItem.findMany({ where: { invoiceId: atCost.id } });
  assert(atCostLines[0].amountCents === 50_000, "an explicit 0% still bills at cost");

  // Totalling sanity: tax follows the lines, not the invoice.
  const totals = computeInvoiceTotals([{ amountCents: 100_000, taxable: true }, { amountCents: 70_000, taxable: false }], 750);
  assert(totals.taxCents === 7_500, "tax is charged on the taxable subtotal only");

  await db.invoiceLineItem.deleteMany({ where: { invoice: { jobId: job.id } } });
  await db.invoice.deleteMany({ where: { jobId: job.id } });
  await db.billLineItem.deleteMany({ where: { bill: { jobId: job.id } } });
  await db.bill.deleteMany({ where: { jobId: job.id } });
  await db.purchaseOrderEvent.deleteMany({ where: { purchaseOrder: { jobId: job.id } } });
  await db.purchaseOrderLineItem.deleteMany({ where: { purchaseOrder: { jobId: job.id } } });
  await db.purchaseOrder.deleteMany({ where: { jobId: job.id } });
  await db.budgetLine.deleteMany({ where: { jobId: job.id } });
  await db.job.delete({ where: { id: job.id } });

  console.log("\nRound-trip bugs verified fixed.");
  await db.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await db.$disconnect();
  process.exit(1);
});
