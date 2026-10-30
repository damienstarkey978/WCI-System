/**
 * Void live JOB_ / J*-INV prefix-duplicate invoices when another live invoice on
 * the same job already covers the same BT id (Heather 1pm bug #9 — triple import).
 *
 * amountInvoiced already skips VOID; this collapses remaining live twins so a job
 * is not over-invoiced. Prefer keeping the short / J*-INV row that already has
 * payments; void the unpaid (or later JOB_*) sibling.
 *
 * Payments that already sit on VOID rows are left in place — reports exclude them
 * (getInvoicingReport / cash flow). Re-running is idempotent.
 *
 *   DATABASE_URL=… npx tsx scripts/migration/void-duplicate-invoice-prefix-twins.mts \
 *     [--org world-construction] [--dry-run] [--apply] [--job job_…]
 */

import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../../src/generated/prisma/client";
import { InvoiceStatus } from "../../src/generated/prisma/enums";

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

function invoiceIdKeys(raw: string): string[] {
  const s = String(raw ?? "").trim();
  if (!s) return [];
  const keys = new Set<string>([s, s.toLowerCase()]);
  if (/^\d+$/.test(s)) keys.add(String(parseInt(s, 10)));
  const labeled = s.match(/^0*(\d+)(\s+.+)$/);
  if (labeled) {
    keys.add(`${labeled[1]}${labeled[2]}`);
    keys.add(s.replace(/^0+/, "") || s);
  }
  return [...keys];
}

function invoiceNumberSuffix(invoiceNumber: string): string {
  const inv = invoiceNumber.trim();
  const jInv = inv.match(/^J\d+-INV-(.+)$/i);
  if (jInv) return jInv[1];
  const job = inv.match(/^JOB_[A-Z0-9]+-(.+)$/i);
  if (job) return job[1];
  const street = inv.match(/^\d+-(.+)$/);
  if (street) return street[1];
  const bare = inv.match(/^(\d+)\b/);
  if (bare) return bare[1];
  const dash = inv.indexOf("-");
  if (dash > 0) return inv.slice(dash + 1);
  return inv;
}

function canonicalBtId(raw: string): string {
  const keys = invoiceIdKeys(raw);
  const digits = keys.filter((k) => /^\d+$/.test(k));
  if (digits.length > 0) return String(parseInt(digits[0], 10));
  return keys.sort((a, b) => a.length - b.length)[0] ?? raw.trim();
}

function paidCents(inv: { payments: readonly { amountCents: number }[] }): number {
  return inv.payments.reduce((s, p) => s + p.amountCents, 0);
}

/** Lower = better survivor. Prefer paid, then short/J*-INV over JOB_*. */
function survivorRank(inv: {
  invoiceNumber: string;
  amountCents: number;
  payments: readonly { amountCents: number }[];
}): number {
  const paid = paidCents(inv);
  const fullyPaid = paid >= inv.amountCents && inv.amountCents > 0 ? 0 : paid > 0 ? 1 : 2;
  const n = inv.invoiceNumber;
  const prefix = n.startsWith("JOB_") ? 3 : n.includes("-INV-") ? 1 : /^\d/.test(n) ? 0 : 2;
  return fullyPaid * 10 + prefix;
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const args = parseArgs(process.argv.slice(2));
const orgSlug = args.org ?? "world-construction";
const apply = args.apply === "true";
const jobFilter = args.job;

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main() {
  const effectiveDryRun = !apply;

  const org = await prisma.organization.findFirst({
    where: { OR: [{ slug: orgSlug }, { name: { contains: "World Construction", mode: "insensitive" } }] },
    select: { id: true, name: true },
  });
  if (!org) {
    console.error(`No organization matching ${orgSlug}`);
    process.exit(1);
  }
  console.log(`Org ${org.name} (${org.id}) — ${effectiveDryRun ? "DRY RUN (pass --apply to mutate)" : "APPLY"}`);

  const invoices = await prisma.invoice.findMany({
    where: {
      organizationId: org.id,
      status: { not: InvoiceStatus.VOID },
      ...(jobFilter ? { jobId: jobFilter } : {}),
    },
    select: {
      id: true,
      jobId: true,
      invoiceNumber: true,
      amountCents: true,
      status: true,
      payments: { select: { amountCents: true } },
      job: { select: { name: true, status: true } },
    },
  });

  const byJob = new Map<string, typeof invoices>();
  for (const inv of invoices) {
    const list = byJob.get(inv.jobId) ?? [];
    list.push(inv);
    byJob.set(inv.jobId, list);
  }

  let wouldVoid = 0;
  let voided = 0;
  let skippedAmount = 0;
  let groups = 0;

  for (const [, jobInvs] of byJob) {
    const byCanon = new Map<string, typeof invoices>();
    for (const inv of jobInvs) {
      const canon = canonicalBtId(invoiceNumberSuffix(inv.invoiceNumber));
      if (!canon) continue;
      const list = byCanon.get(canon) ?? [];
      list.push(inv);
      byCanon.set(canon, list);
    }

    for (const [canon, group] of byCanon) {
      if (group.length < 2) continue;
      groups += 1;
      const ranked = [...group].sort((a, b) => survivorRank(a) - survivorRank(b));
      const keep = ranked[0]!;
      for (const dup of ranked.slice(1)) {
        if (dup.amountCents !== keep.amountCents) {
          skippedAmount += 1;
          console.log(
            `SKIP amount mismatch ${dup.job.name}: ${dup.invoiceNumber} (${dup.amountCents}) vs keep ${keep.invoiceNumber} (${keep.amountCents}) canon=${canon}`,
          );
          continue;
        }
        wouldVoid += 1;
        console.log(
          `${effectiveDryRun ? "DRY " : ""}VOID ${dup.job.name} [${dup.job.status}]: ${dup.invoiceNumber} (${dup.status}, $${(dup.amountCents / 100).toFixed(2)}, paid $${(paidCents(dup) / 100).toFixed(2)}) — keep ${keep.invoiceNumber}`,
        );
        if (!effectiveDryRun) {
          await prisma.invoice.update({
            where: { id: dup.id },
            data: { status: InvoiceStatus.VOID, voidedAt: new Date() },
          });
          voided += 1;
        }
      }
    }
  }

  console.log(
    JSON.stringify(
      {
        dryRun: effectiveDryRun,
        wouldVoid,
        voided,
        skippedAmount,
        dupGroups: groups,
        jobsScanned: byJob.size,
        invoicesScanned: invoices.length,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
