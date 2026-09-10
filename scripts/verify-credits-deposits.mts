/**
 * End-to-end proof of credit memos and deposits against the real database: the
 * status rules, the over-credit guard, and that a deposit applied to an invoice
 * settles that invoice the same way a check would.
 */
import {
  applyCreditMemo,
  applyDepositToInvoice,
  createCreditMemo,
  createDeposit,
  invoiceRemainingCents,
  issueCreditMemo,
  receiveDeposit,
  voidCreditMemo,
} from "../src/lib/invoicing/credits";
import { createInvoice, sendInvoice } from "../src/lib/invoicing/service";
import { getJobBudget } from "../src/lib/budget/service";
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
  const costCode = await db.costCode.findFirstOrThrow({ where: { organizationId: org.id, isActive: true } });
  const stamp = Date.now();

  const job = await db.job.create({
    data: { organizationId: org.id, name: `Credits check ${stamp}`, contractType: "FIXED_PRICE", status: "OPEN" },
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

  // ---- A taxed invoice ------------------------------------------------------
  const invoice = await createInvoice({
    organizationId: org.id,
    jobId: job.id,
    type: "LINE_ITEM",
    invoiceNumber: `INV-${stamp}`,
    issuedOn: new Date("2026-09-10T00:00:00Z"),
    paymentTerms: "NET_30",
    taxRateBasisPoints: 750,
    lineItems: [
      { title: "Materials", amountCents: 100_000, taxable: true },
      { title: "Labor", amountCents: 100_000, taxable: false },
    ],
  });
  assert(invoice.taxCents === 7_500, "tax is charged only on the taxable line");
  assert(invoice.amountCents === 207_500, "the invoice total includes the tax");
  assert(invoice.dueOn?.toISOString().slice(0, 10) === "2026-10-10", "Net 30 sets the due date 30 days out");

  await sendInvoice(org.id, invoice.id);

  const budget = await getJobBudget(job.id, org.id);
  assert(
    budget.funnel.totals.amountInvoicedCents === 200_000,
    "sales tax is excluded from amountInvoiced — it is collected, not earned",
  );
  assert(
    budget.funnel.totals.remainingToInvoiceCents === 800_000,
    "so remaining-to-invoice isn't eaten by the tax charged",
  );

  // ---- Resending doesn't move the goalposts ---------------------------------
  const { resendInvoice } = await import("../src/lib/invoicing/service");
  const resent = await resendInvoice(org.id, invoice.id);
  assert(resent.sendCount === 2, "a resend counts");
  assert(
    resent.dueOn?.toISOString() === invoice.dueOn?.toISOString(),
    "and does not hand a late client a fresh due date",
  );

  // ---- Credit memo ----------------------------------------------------------
  const memo = await createCreditMemo({
    organizationId: org.id,
    jobId: job.id,
    memoNumber: `CM-${stamp}`,
    amountCents: 50_000,
    reason: "Allowance returned",
  });
  await refuses(
    () => applyCreditMemo(org.id, memo.id, invoice.id),
    "a draft credit can't be applied before it is issued",
  );

  await issueCreditMemo(org.id, memo.id);
  await applyCreditMemo(org.id, memo.id, invoice.id);
  assert(
    (await invoiceRemainingCents(org.id, invoice.id)) === 157_500,
    "an applied credit reduces what the invoice still owes",
  );
  await refuses(() => voidCreditMemo(org.id, memo.id), "an applied credit can't be voided out from under the invoice");

  const { recordPayment } = await import("../src/lib/invoicing/service");
  await refuses(
    () => recordPayment({ organizationId: org.id, invoiceId: invoice.id, method: "MANUAL", amountCents: 207_500 }),
    "the full original amount is now an overpayment",
  );

  // ---- Deposit --------------------------------------------------------------
  const deposit = await createDeposit({
    organizationId: org.id,
    jobId: job.id,
    title: "Signing deposit",
    amountCents: 157_500,
  });
  await refuses(
    () => applyDepositToInvoice({ organizationId: org.id, depositId: deposit.id, invoiceId: invoice.id }),
    "a deposit that hasn't been received can't be applied",
  );

  await receiveDeposit({ organizationId: org.id, depositId: deposit.id, method: "MANUAL", reference: "Check 1041" });
  await applyDepositToInvoice({ organizationId: org.id, depositId: deposit.id, invoiceId: invoice.id });

  const settled = await db.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
  assert(settled.status === "PAID", "applying a deposit settles the invoice like any other payment");
  assert(settled.paidAt !== null, "and stamps when it was paid");
  assert((await invoiceRemainingCents(org.id, invoice.id)) === 0, "nothing is left owing");

  // Clean up.
  await db.payment.deleteMany({ where: { invoiceId: invoice.id } });
  await db.deposit.deleteMany({ where: { jobId: job.id } });
  await db.creditMemo.deleteMany({ where: { jobId: job.id } });
  await db.invoiceLineItem.deleteMany({ where: { invoiceId: invoice.id } });
  await db.invoice.deleteMany({ where: { jobId: job.id } });
  await db.budgetLine.deleteMany({ where: { jobId: job.id } });
  await db.job.delete({ where: { id: job.id } });

  console.log("\nCredit memos, deposits, tax and payment terms verified end to end.");
  await db.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await db.$disconnect();
  process.exit(1);
});
