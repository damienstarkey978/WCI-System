/**
 * Delete Payment rows attached to VOID invoices.
 *
 * #85 already excludes these from invoicing/cash-flow reports and the Invoices
 * UI, but migration left orphan payments on prefix-duplicate VOID twins
 * (Newcomb 1/2 alone held ~$765k). Removing them keeps raw Payment aggregates
 * honest and prevents future regressions if a report forgets the VOID filter.
 *
 * Only touches payments whose invoice.status === VOID. Live invoice payments
 * are never deleted. Idempotent.
 *
 *   DATABASE_URL=… npx tsx scripts/migration/delete-void-invoice-payments.mts \
 *     [--org world-construction] [--dry-run] [--apply] [--job job_…]
 */

import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../../src/generated/prisma/client";
import { InvoiceStatus, JobStatus } from "../../src/generated/prisma/enums";

function parseArgs(argv: readonly string[]): Record<string, string> {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token?.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) args[key] = "true";
    else {
      args[key] = next;
      i += 1;
    }
  }
  return args;
}

function dollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const apply = args.apply === "true";
  const dryRun = !apply || args["dry-run"] === "true";
  const orgSlug = args.org ?? "world-construction";
  const jobFilter = args.job;

  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  try {
    const org = await prisma.organization.findFirst({
      where: { OR: [{ slug: orgSlug }, { name: { contains: "World Construction", mode: "insensitive" } }] },
      select: { id: true, name: true, slug: true },
    });
    if (!org) {
      console.error(`Organization not found for --org ${orgSlug}`);
      process.exit(1);
    }

    const voidInvoices = await prisma.invoice.findMany({
      where: {
        organizationId: org.id,
        status: InvoiceStatus.VOID,
        ...(jobFilter ? { jobId: jobFilter } : { job: { status: JobStatus.OPEN } }),
        payments: { some: {} },
      },
      select: {
        id: true,
        invoiceNumber: true,
        amountCents: true,
        job: { select: { id: true, name: true } },
        payments: { select: { id: true, amountCents: true } },
      },
      orderBy: { invoiceNumber: "asc" },
    });

    const paymentIds = voidInvoices.flatMap((inv) => inv.payments.map((p) => p.id));
    const totalCents = voidInvoices.reduce(
      (sum, inv) => sum + inv.payments.reduce((s, p) => s + p.amountCents, 0),
      0,
    );

    const byJob = new Map<string, { name: string; n: number; cents: number }>();
    for (const inv of voidInvoices) {
      const cur = byJob.get(inv.job.id) ?? { name: inv.job.name, n: 0, cents: 0 };
      cur.n += inv.payments.length;
      cur.cents += inv.payments.reduce((s, p) => s + p.amountCents, 0);
      byJob.set(inv.job.id, cur);
    }

    console.log(
      JSON.stringify(
        {
          mode: dryRun ? "dry-run" : "apply",
          organization: { id: org.id, slug: org.slug, name: org.name },
          voidInvoicesWithPayments: voidInvoices.length,
          paymentRows: paymentIds.length,
          paymentCents: totalCents,
          paymentDollars: dollars(totalCents),
          byJob: [...byJob.entries()]
            .map(([jobId, v]) => ({ jobId, ...v, dollars: dollars(v.cents) }))
            .sort((a, b) => b.cents - a.cents),
        },
        null,
        2,
      ),
    );

    if (dryRun) {
      console.log("Dry run only — pass --apply to delete.");
      return;
    }

    if (paymentIds.length === 0) {
      console.log("Nothing to delete.");
      return;
    }

    const result = await prisma.payment.deleteMany({ where: { id: { in: paymentIds } } });
    console.log(`Deleted ${result.count} Payment rows on VOID invoices.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
