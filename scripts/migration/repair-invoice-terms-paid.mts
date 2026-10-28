/**
 * One-shot / re-runnable repair:
 * 1. Clear NET_30 → CUSTOM on all invoices (WCI never uses Net 30).
 * 2. Demote PAID invoices with $0 Payment rows to SENT (Heather #15 display gap).
 * 3. Fill Candlebark 932-1 title from BT when blank.
 *
 *   DATABASE_URL=… npx tsx scripts/migration/repair-invoice-terms-paid.mts [--dry-run]
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client";

const dryRun = process.argv.includes("--dry-run");
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const adapter = new PrismaPg({ connectionString });
const db = new PrismaClient({ adapter });

async function main() {
  const net30 = await db.invoice.count({ where: { paymentTerms: "NET_30" } });
  console.log(`Invoices with NET_30: ${net30}`);
  if (!dryRun && net30 > 0) {
    const updated = await db.invoice.updateMany({
      where: { paymentTerms: "NET_30" },
      data: { paymentTerms: "CUSTOM" },
    });
    console.log(`  → set CUSTOM: ${updated.count}`);
  }

  const paidNoPay = await db.$queryRaw<
    { id: string; invoiceNumber: string; amountCents: number }[]
  >`
    SELECT i.id, i."invoiceNumber", i."amountCents"
    FROM "Invoice" i
    LEFT JOIN "Payment" p ON p."invoiceId" = i.id
    WHERE i.status = 'PAID'
    GROUP BY i.id
    HAVING COALESCE(SUM(p."amountCents"), 0) = 0
  `;
  console.log(`PAID with $0 payments: ${paidNoPay.length}`);
  if (!dryRun) {
    for (const row of paidNoPay) {
      await db.invoice.update({
        where: { id: row.id },
        data: { status: "SENT", paidAt: null },
      });
      console.log(`  → ${row.invoiceNumber}: PAID → SENT`);
    }
  } else {
    for (const row of paidNoPay.slice(0, 10)) {
      console.log(`  dry: ${row.invoiceNumber}`);
    }
    if (paidNoPay.length > 10) console.log(`  … +${paidNoPay.length - 10} more`);
  }

  const candlebark = await db.invoice.findFirst({
    where: { invoiceNumber: "932-1" },
    select: { id: true, title: true, paymentTerms: true, status: true },
  });
  if (candlebark) {
    console.log(`Candlebark 932-1: title=${candlebark.title} terms=${candlebark.paymentTerms} status=${candlebark.status}`);
    if (!dryRun && !candlebark.title) {
      await db.invoice.update({
        where: { id: candlebark.id },
        data: {
          title: "Draw 1 - Upon Execution (20%)",
          paymentTerms: "CUSTOM",
        },
      });
      console.log("  → set BT title + CUSTOM terms");
    }
  } else {
    console.log("Candlebark 932-1 not found");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
