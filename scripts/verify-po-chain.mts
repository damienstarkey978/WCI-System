/**
 * End-to-end proof of the PO -> Bill -> Job Costing Budget chain against the real
 * local dev database. Answers the audit's Gap 4 item 3 directly: are Committed and
 * Actual Cost actually computed, or hardcoded to $0?
 */
import { getJobBudget } from "../src/lib/budget/service";
import { db } from "../src/lib/db";
import { createPurchaseOrder } from "../src/lib/purchase-orders/service";
import { approvePurchaseOrder, purchaseOrderProgress, sendForApproval, setWorkStatus } from "../src/lib/purchase-orders/workflow";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error("FAILED: " + msg);
  console.log("OK: " + msg);
}

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

async function main() {
  const org = await db.organization.findFirstOrThrow();
  const costCode = await db.costCode.findFirstOrThrow({ where: { organizationId: org.id, isActive: true } });

  const job = await db.job.create({
    data: { organizationId: org.id, name: `PO chain check ${Date.now()}`, contractType: "FIXED_PRICE", status: "OPEN" },
  });

  // A budget line for the cost code, so the funnel has a row to attribute against.
  await db.budgetLine.create({
    data: {
      jobId: job.id,
      costCodeId: costCode.id,
      originalBudgetCostCents: 500_00,
      revisedBudgetCostCents: 500_00,
      originalClientPriceCents: 750_00,
      revisedClientPriceCents: 750_00,
    },
  });

  const before = await getJobBudget(job.id, org.id);
  const beforeLine = before.funnel.lines.find((line) => line.costCodeId === costCode.id)!;
  assert(beforeLine.committedCostCents === 0, "committed cost starts at $0 with no POs");
  assert(beforeLine.actualCostCents === 0, "actual cost starts at $0 with no bills");

  // ---- PO, drafted then approved -------------------------------------------
  const po = await createPurchaseOrder({
    organizationId: org.id,
    jobId: job.id,
    poNumber: `PO-CHK-${Date.now()}`,
    vendorName: "Verify Sub LLC",
    title: "Install shower pan",
    scopeOfWork: "Sub agrees to site cleanliness and PPE requirements.",
    lineItems: [{ costCodeId: costCode.id, title: "Labor", quantityMilli: 1000, unitCostCents: 300_00 }],
  });

  const draftBudget = await getJobBudget(job.id, org.id);
  assert(
    draftBudget.funnel.lines.find((l) => l.costCodeId === costCode.id)!.committedCostCents === 0,
    "a DRAFT PO does not count as committed",
  );

  // A PO can't jump straight from DRAFT to APPROVED — it has to be sent to the
  // vendor first. (Verified below: the attempt throws rather than silently allowing
  // an unsent PO to become committed cost.)
  let rejectedEarlyApproval = false;
  try {
    await approvePurchaseOrder({ organizationId: org.id, purchaseOrderId: po.id, approvedBy: "VENDOR" });
  } catch {
    rejectedEarlyApproval = true;
  }
  assert(rejectedEarlyApproval, "approving a PO that was never sent is refused");

  await sendForApproval({ organizationId: org.id, purchaseOrderId: po.id });
  await approvePurchaseOrder({
    organizationId: org.id,
    purchaseOrderId: po.id,
    approvedBy: "VENDOR",
    vendorSignatureName: "Sam Sub",
  });

  const approved = await db.purchaseOrder.findUniqueOrThrow({ where: { id: po.id } });
  assert(approved.agreementSnapshot === "Sub agrees to site cleanliness and PPE requirements.", "vendor acceptance froze the agreement snapshot");
  assert(approved.approvedBy === "VENDOR", "approvedBy records that the vendor signed, not staff");

  const afterPo = await getJobBudget(job.id, org.id);
  const poLine = afterPo.funnel.lines.find((l) => l.costCodeId === costCode.id)!;
  assert(poLine.committedCostCents === 300_00, `approved PO shows as committed cost (${money(poLine.committedCostCents)})`);
  assert(poLine.actualCostCents === 0, "still no actual cost, since nothing is billed yet");

  // ---- Bill against that PO -------------------------------------------------
  await db.bill.create({
    data: {
      organizationId: org.id,
      jobId: job.id,
      purchaseOrderId: po.id,
      vendorName: "Verify Sub LLC",
      billNumber: "B-001",
      approvalStatus: "PAID",
      paidAt: new Date(),
      lineItems: { create: [{ costCodeId: costCode.id, title: "Labor", amountCents: 180_00 }] },
    },
  });

  const afterBill = await getJobBudget(job.id, org.id);
  const billLine = afterBill.funnel.lines.find((l) => l.costCodeId === costCode.id)!;
  assert(billLine.committedCostCents === 300_00, "committed cost still reflects the PO");
  assert(billLine.actualCostCents === 180_00, `paid bill shows as actual cost (${money(billLine.actualCostCents)})`);

  const progress = await purchaseOrderProgress(org.id, po.id);
  assert(progress.committedCents === 300_00, "PO progress: committed is the PO's face value");
  assert(progress.billedCents === 180_00, "PO progress: billed is the bill total");
  assert(progress.outstandingCents === 120_00, `PO progress: outstanding is the remainder (${money(progress.outstandingCents)})`);
  assert(progress.billedPercent === 60, "PO progress: 60% billed");

  // ---- Work status is a separate axis --------------------------------------
  await setWorkStatus({ organizationId: org.id, purchaseOrderId: po.id, workComplete: true });
  const done = await db.purchaseOrder.findUniqueOrThrow({ where: { id: po.id } });
  assert(done.workStatus === "WORK_COMPLETE", "work status flipped to WORK_COMPLETE");
  assert(done.status === "APPROVED", "marking work complete left PO status alone (still APPROVED)");

  const afterWork = await getJobBudget(job.id, org.id);
  assert(
    afterWork.funnel.lines.find((l) => l.costCodeId === costCode.id)!.committedCostCents === 300_00,
    "committed cost unchanged by work completion — the commitment is the same money",
  );

  const events = await db.purchaseOrderEvent.findMany({ where: { purchaseOrderId: po.id }, orderBy: { createdAt: "asc" } });
  assert(events.length === 4, `audit trail recorded every step (${events.map((e) => e.type).join(" -> ")})`);

  // Clean up so repeated runs don't litter the dev database.
  await db.bill.deleteMany({ where: { jobId: job.id } });
  await db.purchaseOrder.deleteMany({ where: { jobId: job.id } });
  await db.budgetLine.deleteMany({ where: { jobId: job.id } });
  await db.job.delete({ where: { id: job.id } });

  console.log("\nPO -> Bill -> Job Costing Budget chain verified end to end.");
  await db.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await db.$disconnect();
  process.exit(1);
});
