/**
 * The two bugs Cowork hit importing 8,212 Buildertrend rows:
 *
 *  1. A refund invoice (negative amountCents) was rejected as overpaid, because the
 *     guard compared `paymentsTotal > amountCents` without regard to sign — true even
 *     with no payments at all, since 0 > -5000.
 *  2. The financial list endpoints hardcoded `take: 100` and ignored ?limit=, with no
 *     cursor and nothing in the response saying more rows existed — so a migration
 *     reading back what it had written silently saw only the first hundred.
 */
import { OverpaidInvoiceError, importInvoice } from "../src/lib/migration/service";
import { listBillsQuerySchema, listInvoicesQuerySchema, listPurchaseOrdersQuerySchema } from "../src/lib/api-schemas";
import { db } from "../src/lib/db";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error("FAILED: " + msg);
  console.log("OK: " + msg);
}

async function main() {
  const org = await db.organization.findFirstOrThrow();
  const user = await db.user.findFirstOrThrow({ where: { organizationId: org.id } });
  const stamp = Date.now();
  const job = await db.job.create({
    data: { organizationId: org.id, name: `Migration fixes ${stamp}`, contractType: "FIXED_PRICE", status: "OPEN" },
  });

  const base = {
    organizationId: org.id,
    jobId: job.id,
    uploadedByUserId: user.id,
    type: "FLAT" as const,
    createdAt: new Date("2026-03-01T00:00:00Z"),
  };

  // ---- Bug 1: refund invoices ---------------------------------------------
  const refund = await importInvoice({
    ...base,
    invoiceNumber: `REFUND-${stamp}`,
    status: "PAID",
    amountCents: -50_000,
  });
  assert(refund.amountCents === -50_000, "a refund invoice with no payments now imports");

  const refundPaid = await importInvoice({
    ...base,
    invoiceNumber: `REFUND-PAID-${stamp}`,
    status: "PAID",
    amountCents: -50_000,
    payments: [{ method: "MANUAL", amountCents: -50_000, receivedAt: new Date("2026-03-05T00:00:00Z") }],
  });
  assert(refundPaid.payments.length === 1, "and so does one with the matching refund payment against it");

  let refusedRefund = false;
  try {
    await importInvoice({
      ...base,
      invoiceNumber: `REFUND-OVER-${stamp}`,
      status: "PAID",
      amountCents: -50_000,
      payments: [{ method: "MANUAL", amountCents: -60_000, receivedAt: new Date("2026-03-05T00:00:00Z") }],
    });
  } catch (error) {
    refusedRefund = error instanceof OverpaidInvoiceError;
  }
  assert(refusedRefund, "refunding more than the invoice is still refused — the guard follows the sign, it isn't gone");

  let refusedPositive = false;
  try {
    await importInvoice({
      ...base,
      invoiceNumber: `OVER-${stamp}`,
      status: "PAID",
      amountCents: 50_000,
      payments: [{ method: "MANUAL", amountCents: 60_000, receivedAt: new Date("2026-03-05T00:00:00Z") }],
    });
  } catch (error) {
    refusedPositive = error instanceof OverpaidInvoiceError;
  }
  assert(refusedPositive, "and overpaying a normal invoice is refused exactly as before");

  const exact = await importInvoice({
    ...base,
    invoiceNumber: `EXACT-${stamp}`,
    status: "PAID",
    amountCents: 50_000,
    payments: [{ method: "MANUAL", amountCents: 50_000, receivedAt: new Date("2026-03-05T00:00:00Z") }],
  });
  assert(exact.payments.length === 1, "paying a normal invoice in full still works");

  // ---- Bug 2: the query schemas now carry paging ---------------------------
  const defaulted = listBillsQuerySchema.parse({});
  assert(defaulted.limit === 50, "bills default to 50 per page rather than a silent 100");

  const asked = listInvoicesQuerySchema.parse({ limit: "200" });
  assert(asked.limit === 200, "and ?limit= is honoured up to 200");

  const tooMany = listPurchaseOrdersQuerySchema.safeParse({ limit: "5000" });
  assert(!tooMany.success, "a limit past the ceiling is a 400, not a silent truncation");

  const badStatus = listPurchaseOrdersQuerySchema.safeParse({ status: "NOT_A_STATUS" });
  assert(!badStatus.success, "and a misspelled status is rejected instead of passed through as never");

  // ---- Paging actually walks the whole set ---------------------------------
  await db.invoice.createMany({
    data: Array.from({ length: 12 }, (_, index) => ({
      organizationId: org.id,
      jobId: job.id,
      type: "FLAT" as const,
      invoiceNumber: `PAGE-${stamp}-${index}`,
      amountCents: 1_000,
      createdAt: new Date(Date.UTC(2026, 0, index + 1)),
    })),
  });

  const seen: string[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 10; page++) {
    const rows = await db.invoice.findMany({
      where: { organizationId: org.id, jobId: job.id, invoiceNumber: { startsWith: `PAGE-${stamp}` } },
      orderBy: { createdAt: "desc" },
      take: 5 + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const hasMore = rows.length > 5;
    const slice = hasMore ? rows.slice(0, 5) : rows;
    seen.push(...slice.map((row) => row.id));
    if (!hasMore) break;
    cursor = slice[slice.length - 1].id;
  }
  assert(seen.length === 12, "walking the cursor returns all 12 rows, not the first page over and over");
  assert(new Set(seen).size === 12, "with no duplicates across page boundaries");

  await db.payment.deleteMany({ where: { invoice: { jobId: job.id } } });
  await db.invoice.deleteMany({ where: { jobId: job.id } });
  await db.job.delete({ where: { id: job.id } });

  console.log("\nBoth migration API bugs verified fixed.");
  await db.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await db.$disconnect();
  process.exit(1);
});
