/**
 * Bug 3, second pass. The markup was never dropped — formatMoney rounded to whole
 * dollars, so a 20% markup on a $1 bill stored 120 cents and displayed "$1". The
 * report said the dollar amount was wrong; the stored amount was right and the
 * screen was lying about it.
 */
import { addBillToInvoice } from "../src/lib/bills/to-invoice";
import { formatMoney } from "../src/lib/format";
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
    data: { organizationId: org.id, name: `Markup display ${stamp}`, contractType: "FIXED_PRICE", status: "OPEN" },
  });

  // Cowork's exact repro: a $1.00 bill at 20%.
  const bill = await db.bill.create({
    data: {
      organizationId: org.id, jobId: job.id, billNumber: `MIGTESTBILL-${stamp}`, vendorName: "Test",
      approvalStatus: "IN_REVIEW",
      lineItems: { create: [{ costCodeId: costCode.id, title: "Probe", amountCents: 100 }] },
    },
  });

  const invoice = await addBillToInvoice({ organizationId: org.id, billId: bill.id, markupBasisPoints: 2000 });
  const lines = await db.invoiceLineItem.findMany({ where: { invoiceId: invoice.id } });

  assert(lines[0].amountCents === 120, "a 20% markup on a $1 bill stores 120 cents — it always did");
  assert(invoice.amountCents === 120, "and the invoice total is 120 cents");
  assert(formatMoney(120) === "$1.20", "and now displays as $1.20 instead of $1");
  assert(formatMoney(100) === "$1.00", "the un-marked-up amount is distinguishable from it");

  // The wider bug: every money figure in the app was rounded to whole dollars.
  assert(formatMoney(123_456) === "$1,234.56", "cents are no longer swallowed on ordinary amounts");
  assert(formatMoney(866_062_55) === "$866,062.55", "including the six-figure invoice totals already in production");
  assert(formatMoney(-50_000) === "-$500.00", "and refunds still read as negative");
  assert(formatMoney(0) === "$0.00", "zero reads as zero, not a blank");

  await db.invoiceLineItem.deleteMany({ where: { invoice: { jobId: job.id } } });
  await db.invoice.deleteMany({ where: { jobId: job.id } });
  await db.billLineItem.deleteMany({ where: { bill: { jobId: job.id } } });
  await db.bill.deleteMany({ where: { jobId: job.id } });
  await db.job.delete({ where: { id: job.id } });

  console.log("\nMarkup display verified.");
  await db.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await db.$disconnect();
  process.exit(1);
});
