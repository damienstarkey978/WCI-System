/**
 * Proves "Add to invoice": a vendor's cost reaches the client at a markup, keeps its
 * breakdown, and cannot be billed to them twice.
 */
import { addBillToInvoice } from "../src/lib/bills/to-invoice";
import { updateBillStatus } from "../src/lib/bills/service";
import { db } from "../src/lib/db";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error("FAILED: " + msg);
  console.log("OK: " + msg);
}

async function refuses(work: () => Promise<unknown>, msg: string) {
  try {
    await work();
  } catch {
    console.log("OK: " + msg);
    return;
  }
  throw new Error("FAILED: " + msg);
}

async function main() {
  const org = await db.organization.findFirstOrThrow();
  const codes = await db.costCode.findMany({ where: { organizationId: org.id, isActive: true }, take: 2 });
  const stamp = Date.now();

  const job = await db.job.create({
    data: { organizationId: org.id, name: `Bill to invoice ${stamp}`, contractType: "FIXED_PRICE", status: "OPEN" },
  });

  // An unread receipt: nobody has checked the figures, so it can't be charged on.
  const unread = await db.bill.create({
    data: {
      organizationId: org.id,
      jobId: job.id,
      vendorName: "Unknown vendor",
      approvalStatus: "INBOX",
      lineItems: { create: [{ costCodeId: codes[0].id, title: "Something", amountCents: 10_000 }] },
    },
  });
  await refuses(
    () => addBillToInvoice({ organizationId: org.id, billId: unread.id, markupBasisPoints: 2000 }),
    "an unreviewed INBOX bill can't be billed to a client",
  );

  // A real reviewed bill: $400 of materials and $200 of labor.
  const bill = await db.bill.create({
    data: {
      organizationId: org.id,
      jobId: job.id,
      vendorName: "The Home Depot",
      approvalStatus: "APPROVED",
      lineItems: {
        create: [
          { costCodeId: codes[0].id, title: "Lumber", amountCents: 40_000, costType: "MATERIAL" },
          { costCodeId: codes[1].id, title: "Install labor", amountCents: 20_000, costType: "LABOR" },
        ],
      },
    },
  });

  const invoice = await addBillToInvoice({ organizationId: org.id, billId: bill.id, markupBasisPoints: 2000 });
  const withLines = await db.invoice.findUniqueOrThrow({
    where: { id: invoice.id },
    include: { lineItems: { orderBy: { sortOrder: "asc" } } },
  });

  assert(withLines.status === "DRAFT", "the charge lands as a draft — this proposes a charge, it doesn't send one");
  assert(withLines.lineItems.length === 2, "the vendor's own breakdown survives instead of collapsing to one line");
  assert(withLines.lineItems[0].amountCents === 48_000, "$400 of materials at 20% reaches the client as $480");
  assert(withLines.lineItems[1].amountCents === 24_000, "and $200 of labor as $240");
  assert(withLines.amountCents === 72_000, "the invoice totals both");
  assert(
    withLines.lineItems.every((line) => line.sourceBillId === bill.id),
    "every line points back at the bill it came from",
  );
  assert(
    withLines.lineItems[0].taxable === true && withLines.lineItems[1].taxable === false,
    "a taxable material stays taxable and labor stays exempt",
  );
  assert(
    withLines.lineItems[0].unitCostCents === 40_000 && withLines.lineItems[0].rateBasisPoints === 2000,
    "the line records what it cost and the markup applied, not just the result",
  );

  await refuses(
    () => addBillToInvoice({ organizationId: org.id, billId: bill.id, markupBasisPoints: 2000 }),
    "the same cost can't be billed to the client twice",
  );

  // Voiding the invoice withdraws the charge, so the cost is billable again.
  await db.invoice.update({ where: { id: invoice.id }, data: { status: "VOID", voidedAt: new Date() } });
  const second = await addBillToInvoice({ organizationId: org.id, billId: bill.id, markupBasisPoints: 3000 });
  assert(second.id !== invoice.id, "voiding the invoice frees the cost to be re-billed");
  assert(second.amountCents === 78_000, "and the new markup applies — 30% of $600 is $780");

  // Appending to an existing draft rather than starting another one.
  const third = await db.bill.create({
    data: {
      organizationId: org.id,
      jobId: job.id,
      vendorName: "Rental Co",
      approvalStatus: "APPROVED",
      lineItems: { create: [{ costCodeId: codes[0].id, title: "Scissor lift", amountCents: 15_000, costType: "EQUIPMENT" }] },
    },
  });
  const appended = await addBillToInvoice({
    organizationId: org.id,
    billId: third.id,
    markupBasisPoints: 2000,
    invoiceId: second.id,
  });
  assert(appended.amountCents === 96_000, "appending a $150 cost at 20% adds $180 to the existing draft");

  await db.invoice.update({ where: { id: second.id }, data: { status: "SENT", issuedOn: new Date() } });
  const fourth = await db.bill.create({
    data: {
      organizationId: org.id,
      jobId: job.id,
      vendorName: "Late Co",
      approvalStatus: "APPROVED",
      lineItems: { create: [{ costCodeId: codes[0].id, title: "Extra", amountCents: 5_000 }] },
    },
  });
  await refuses(
    () => addBillToInvoice({ organizationId: org.id, billId: fourth.id, markupBasisPoints: 2000, invoiceId: second.id }),
    "an invoice that has already gone out can't have lines added to it",
  );

  await updateBillStatus(org.id, unread.id, "VOID");

  await db.invoiceLineItem.deleteMany({ where: { invoice: { jobId: job.id } } });
  await db.invoice.deleteMany({ where: { jobId: job.id } });
  await db.billLineItem.deleteMany({ where: { bill: { jobId: job.id } } });
  await db.bill.deleteMany({ where: { jobId: job.id } });
  await db.job.delete({ where: { id: job.id } });

  console.log("\nAdd to invoice verified end to end.");
  await db.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await db.$disconnect();
  process.exit(1);
});
