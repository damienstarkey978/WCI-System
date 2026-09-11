/**
 * Proves the delete rules: an import artifact can be removed, and anything that has
 * taken part in the money flow is refused with a reason naming the alternative.
 */
import { addBillToInvoice } from "../src/lib/bills/to-invoice";
import { NotDiscardableError, deleteBill, deleteInvoice, deletePurchaseOrder } from "../src/lib/financials/discard";
import { createInvoice, recordPayment, sendInvoice } from "../src/lib/invoicing/service";
import { sendForApproval } from "../src/lib/purchase-orders/workflow";
import { db } from "../src/lib/db";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error("FAILED: " + msg);
  console.log("OK: " + msg);
}

async function refusedBecause(work: () => Promise<unknown>, reason: string, msg: string) {
  try {
    await work();
  } catch (error) {
    if (error instanceof NotDiscardableError && error.reason === reason) {
      console.log("OK: " + msg);
      return;
    }
    throw new Error(`FAILED: ${msg} — refused, but for "${(error as NotDiscardableError).reason}" not "${reason}"`);
  }
  throw new Error("FAILED: " + msg + " — it was deleted");
}

async function main() {
  const org = await db.organization.findFirstOrThrow();
  const costCode = await db.costCode.findFirstOrThrow({ where: { organizationId: org.id, isActive: true } });
  const vendor = await db.vendor.findFirst({ where: { organizationId: org.id } });
  const stamp = Date.now();

  const job = await db.job.create({
    data: { organizationId: org.id, name: `Delete rules ${stamp}`, contractType: "FIXED_PRICE", status: "OPEN" },
  });

  const newPo = (n: string) =>
    db.purchaseOrder.create({
      data: {
        organizationId: org.id,
        jobId: job.id,
        poNumber: n,
        vendorId: vendor?.id ?? null,
        vendorName: "Test Vendor",
        lineItems: { create: [{ costCodeId: costCode.id, title: "Work", quantityMilli: 1000, unitCostCents: 150_000 }] },
      },
    });

  // ---- A throwaway draft PO, exactly like MIGTEST-0001 ----------------------
  const throwaway = await newPo(`MIGTEST-${stamp}`);
  const deleted = await deletePurchaseOrder(org.id, throwaway.id);
  assert(deleted.poNumber === `MIGTEST-${stamp}`, "a draft PO with nothing against it deletes");
  assert(
    (await db.purchaseOrderLineItem.count({ where: { purchaseOrderId: throwaway.id } })) === 0,
    "and takes its line items with it rather than orphaning them",
  );

  // ---- A PO that has been sent for approval is a commitment -----------------
  const sent = await newPo(`PO-SENT-${stamp}`);
  await sendForApproval({ organizationId: org.id, purchaseOrderId: sent.id });
  await refusedBecause(
    () => deletePurchaseOrder(org.id, sent.id),
    "not_draft",
    "a PO past draft is refused — cancel it instead",
  );

  // ---- A draft PO with a bill against it ------------------------------------
  const billed = await newPo(`PO-BILLED-${stamp}`);
  const linkedBill = await db.bill.create({
    data: {
      organizationId: org.id,
      jobId: job.id,
      purchaseOrderId: billed.id,
      vendorName: "Test Vendor",
      lineItems: { create: [{ costCodeId: costCode.id, title: "Work", amountCents: 150_000 }] },
    },
  });
  await refusedBecause(
    () => deletePurchaseOrder(org.id, billed.id),
    "has_bills",
    "a PO with a bill against it is refused — the bill would lose what authorised it",
  );

  // ---- Bills ---------------------------------------------------------------
  const scratch = await db.bill.create({
    data: {
      organizationId: org.id,
      jobId: job.id,
      billNumber: `MIGTESTBILL-${stamp}`,
      vendorName: "Test Vendor",
      lineItems: { create: [{ costCodeId: costCode.id, title: "Probe", amountCents: 1 }] },
    },
  });
  const gone = await deleteBill(org.id, scratch.id);
  assert(gone.label === `MIGTESTBILL-${stamp}`, "a bill still under review deletes");
  assert(
    (await db.billLineItem.count({ where: { billId: scratch.id } })) === 0,
    "and its cost lines go with it",
  );

  await db.bill.update({ where: { id: linkedBill.id }, data: { approvalStatus: "PAID", paidAt: new Date() } });
  await refusedBecause(
    () => deleteBill(org.id, linkedBill.id),
    "past_review",
    "a paid bill is refused — that money left the account",
  );

  const chargedOn = await db.bill.create({
    data: {
      organizationId: org.id,
      jobId: job.id,
      billNumber: `BILL-CHARGED-${stamp}`,
      vendorName: "Test Vendor",
      approvalStatus: "IN_REVIEW",
      lineItems: { create: [{ costCodeId: costCode.id, title: "Materials", amountCents: 10_000 }] },
    },
  });
  await addBillToInvoice({ organizationId: org.id, billId: chargedOn.id, markupBasisPoints: 2000 });
  await refusedBecause(
    () => deleteBill(org.id, chargedOn.id),
    "billed_to_client",
    "a bill already billed to a client is refused — the client's charge would point at nothing",
  );

  // ---- Invoices ------------------------------------------------------------
  const draftInvoice = await createInvoice({
    organizationId: org.id,
    jobId: job.id,
    type: "LINE_ITEM",
    invoiceNumber: `MIGTESTINV-${stamp}`,
    lineItems: [{ title: "Probe", amountCents: 1 }],
  });
  const removed = await deleteInvoice(org.id, draftInvoice.id);
  assert(removed.invoiceNumber === `MIGTESTINV-${stamp}`, "an untouched draft invoice deletes");

  const live = await createInvoice({
    organizationId: org.id,
    jobId: job.id,
    type: "LINE_ITEM",
    invoiceNumber: `INV-LIVE-${stamp}`,
    issuedOn: new Date(),
    lineItems: [{ title: "Work", amountCents: 100_000 }],
  });
  await sendInvoice(org.id, live.id);
  await refusedBecause(
    () => deleteInvoice(org.id, live.id),
    "not_draft",
    "a sent invoice is refused — void it instead",
  );

  const partPaid = await createInvoice({
    organizationId: org.id,
    jobId: job.id,
    type: "LINE_ITEM",
    invoiceNumber: `INV-PAID-${stamp}`,
    lineItems: [{ title: "Work", amountCents: 100_000 }],
  });
  await recordPayment({ organizationId: org.id, invoiceId: partPaid.id, method: "MANUAL", amountCents: 10_000 });
  await db.invoice.update({ where: { id: partPaid.id }, data: { status: "DRAFT" } });
  await refusedBecause(
    () => deleteInvoice(org.id, partPaid.id),
    "has_payments",
    "even a draft invoice with a payment against it is refused",
  );

  // ---- Org scoping ---------------------------------------------------------
  let scoped = false;
  try {
    await deleteInvoice("some-other-org", live.id);
  } catch {
    scoped = true;
  }
  assert(scoped, "a delete from another organization can't reach this record");

  await db.payment.deleteMany({ where: { invoice: { jobId: job.id } } });
  await db.invoiceLineItem.deleteMany({ where: { invoice: { jobId: job.id } } });
  await db.invoice.deleteMany({ where: { jobId: job.id } });
  await db.billLineItem.deleteMany({ where: { bill: { jobId: job.id } } });
  await db.bill.deleteMany({ where: { jobId: job.id } });
  await db.purchaseOrderEvent.deleteMany({ where: { purchaseOrder: { jobId: job.id } } });
  await db.purchaseOrderLineItem.deleteMany({ where: { purchaseOrder: { jobId: job.id } } });
  await db.purchaseOrder.deleteMany({ where: { jobId: job.id } });
  await db.job.delete({ where: { id: job.id } });

  console.log("\nFinancial delete rules verified end to end.");
  await db.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await db.$disconnect();
  process.exit(1);
});
