/**
 * End-to-end proof of the bill intake pipeline against the real local dev database:
 * the INBOX stage, the approvals gate on READY_FOR_PAYMENT, and lien waivers.
 */
import { getJobBudget } from "../src/lib/budget/service";
import { approveBillAs, claimFromInbox, requireApprovalsComplete, setBillApprovers } from "../src/lib/bills/intake";
import { updateBillStatus } from "../src/lib/bills/service";
import { applyLienWaiver, releaseLienWaiver } from "../src/lib/bills/lien-waivers";
import { db } from "../src/lib/db";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error("FAILED: " + msg);
  console.log("OK: " + msg);
}

async function main() {
  const org = await db.organization.findFirstOrThrow();
  const costCode = await db.costCode.findFirstOrThrow({ where: { organizationId: org.id, isActive: true } });
  const approver = await db.user.findFirstOrThrow({ where: { organizationId: org.id } });

  const job = await db.job.create({
    data: { organizationId: org.id, name: `Bill pipeline check ${Date.now()}`, contractType: "FIXED_PRICE", status: "OPEN" },
  });
  await db.budgetLine.create({
    data: {
      jobId: job.id,
      costCodeId: costCode.id,
      originalBudgetCostCents: 100_000,
      revisedBudgetCostCents: 100_000,
      originalClientPriceCents: 150_000,
      revisedClientPriceCents: 150_000,
    },
  });

  // ---- A receipt arrives, unread ------------------------------------------
  const bill = await db.bill.create({
    data: {
      organizationId: org.id,
      jobId: job.id,
      vendorName: "The Home Depot",
      title: "IMG_4963.jpg",
      approvalStatus: "INBOX",
      source: "EMAIL",
      sourceEmailFrom: "receipts@homedepot.com",
      lineItems: { create: [{ costCodeId: costCode.id, title: "Materials", amountCents: 42_000 }] },
    },
  });

  const inboxBudget = await getJobBudget(job.id, org.id);
  assert(
    inboxBudget.funnel.lines.find((l) => l.costCodeId === costCode.id)!.actualCostCents === 0,
    "an unread INBOX bill does not count as actual cost",
  );

  // ---- A human opens it ----------------------------------------------------
  await claimFromInbox({ organizationId: org.id, billId: bill.id, userId: approver.id });
  const claimed = await db.bill.findUniqueOrThrow({ where: { id: bill.id } });
  assert(claimed.approvalStatus === "IN_REVIEW", "claiming from the inbox moves it to IN_REVIEW");
  assert(claimed.createdByUserId === approver.id, "an email-sourced bill gets attributed to whoever picked it up");

  const reviewBudget = await getJobBudget(job.id, org.id);
  assert(
    reviewBudget.funnel.lines.find((l) => l.costCodeId === costCode.id)!.actualCostCents === 42_000,
    "once in review it counts as actual cost under accrual",
  );

  // ---- The approvals gate --------------------------------------------------
  await setBillApprovers({ organizationId: org.id, billId: bill.id, approverUserIds: [approver.id] });
  await updateBillStatus(org.id, bill.id, "APPROVED");

  let blocked = false;
  try {
    await updateBillStatus(org.id, bill.id, "READY_FOR_PAYMENT");
  } catch {
    blocked = true;
  }
  assert(blocked, "READY_FOR_PAYMENT is refused while an assigned approver hasn't signed");

  await approveBillAs({ organizationId: org.id, billId: bill.id, approverUserId: approver.id, note: "Checked receipt" });
  await requireApprovalsComplete(org.id, bill.id);
  await updateBillStatus(org.id, bill.id, "READY_FOR_PAYMENT");
  const ready = await db.bill.findUniqueOrThrow({ where: { id: bill.id } });
  assert(ready.approvalStatus === "READY_FOR_PAYMENT", "once signed, it moves to READY_FOR_PAYMENT");

  // Re-assigning the same approver must not discard the signature already given.
  await setBillApprovers({ organizationId: org.id, billId: bill.id, approverUserIds: [approver.id] });
  const stillSigned = await db.billApproval.findFirstOrThrow({ where: { billId: bill.id } });
  assert(stillSigned.approvedAt !== null, "re-saving the approver list keeps signatures already given");

  // ---- Lien waiver ---------------------------------------------------------
  const waiver = await applyLienWaiver({ organizationId: org.id, billId: bill.id, templateName: "Standard Lien Waiver" });
  assert(waiver.status === "UNRELEASED", "a fresh waiver starts unreleased");
  assert(waiver.body?.includes("The Home Depot") === true, "the waiver is filled with the bill's own vendor");
  assert(waiver.body?.includes("$420.00") === true, "and with the bill's own amount");

  await releaseLienWaiver({ organizationId: org.id, lienWaiverId: waiver.id });
  let refusedEdit = false;
  try {
    await applyLienWaiver({ organizationId: org.id, billId: bill.id, templateName: "Standard Lien Waiver" });
  } catch {
    refusedEdit = true;
  }
  assert(refusedEdit, "a released waiver can't be regenerated — what went out is the record");

  await updateBillStatus(org.id, bill.id, "PAID");
  const paidBudget = await getJobBudget(job.id, org.id);
  assert(
    paidBudget.funnel.lines.find((l) => l.costCodeId === costCode.id)!.actualCostCents === 42_000,
    "a paid bill counts as actual cost on either accounting basis",
  );

  // Clean up.
  await db.lienWaiver.deleteMany({ where: { billId: bill.id } });
  await db.bill.deleteMany({ where: { jobId: job.id } });
  await db.budgetLine.deleteMany({ where: { jobId: job.id } });
  await db.job.delete({ where: { id: job.id } });

  console.log("\nBill intake pipeline verified end to end.");
  await db.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await db.$disconnect();
  process.exit(1);
});
