/**
 * Void JOB_*-prefixed bill clones that double-count against a short BT bill
 * number on the same job (Heather known-bug #31).
 *
 * Pattern after dual BT imports: `0007` + `JOB_5E26-0007` (same vendor, same
 * total) both PAID → actual cost counts twice. VOID is excluded from the
 * commitment funnel (src/lib/budget/funnel.ts). PAID→VOID is not allowed via
 * updateBillStatus; this migration writes VOID directly (same class of repair
 * as invoice unpaid-dup voids).
 *
 * Prefer keeping the short BT number; void the JOB_* twin when totals match.
 *
 *   DATABASE_URL=… npx tsx scripts/migration/void-job-prefixed-bill-dups.mts \
 *     [--org world-construction] [--dry-run] [--job job_…]
 *
 * Does not touch QBO — both DocNumbers may still exist there; reconcile separately.
 */

import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../../src/generated/prisma/client";
import { BillApprovalStatus } from "../../src/generated/prisma/enums";

function parseArgs(argv: readonly string[]): Record<string, string> {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token?.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) {
      args[key] = "true";
    } else {
      args[key] = next;
      i += 1;
    }
  }
  return args;
}

/** `JOB_5E26-0007` → `0007`; `JOB_5895-I13705` → `I13705`. */
function shortSiblingNumber(jobPrefixed: string): string | null {
  const match = /^JOB_[A-Za-z0-9]+-(.+)$/.exec(jobPrefixed.trim());
  return match?.[1] ?? null;
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
    select: { id: true, name: true, slug: true },
  });
  if (!org) {
    console.error(`No organization matching ${orgSlug}`);
    process.exit(1);
  }
  console.log(`Org ${org.name} (${org.id}) — ${effectiveDryRun ? "DRY RUN (pass --apply to mutate)" : "APPLY"}`);

  const bills = await prisma.bill.findMany({
    where: {
      organizationId: org.id,
      approvalStatus: { not: BillApprovalStatus.VOID },
      ...(jobFilter ? { jobId: jobFilter } : {}),
    },
    select: {
      id: true,
      jobId: true,
      billNumber: true,
      vendorName: true,
      vendorId: true,
      approvalStatus: true,
      qboBillId: true,
      lineItems: { select: { amountCents: true } },
      job: { select: { name: true } },
    },
  });

  const byJob = new Map<string, typeof bills>();
  for (const bill of bills) {
    const list = byJob.get(bill.jobId) ?? [];
    list.push(bill);
    byJob.set(bill.jobId, list);
  }

  let wouldVoid = 0;
  let voided = 0;
  let skippedNoTwin = 0;
  let skippedAmount = 0;

  for (const [jobId, jobBills] of byJob) {
    const byNumber = new Map<string, (typeof bills)[number]>();
    for (const bill of jobBills) {
      const num = bill.billNumber?.trim();
      if (!num) continue;
      // Prefer keeping an existing short entry if two collide.
      if (!byNumber.has(num)) byNumber.set(num, bill);
    }

    for (const bill of jobBills) {
      const num = bill.billNumber?.trim();
      if (!num?.startsWith("JOB_")) continue;
      const short = shortSiblingNumber(num);
      if (!short) {
        skippedNoTwin += 1;
        continue;
      }
      const twin = byNumber.get(short);
      if (!twin || twin.id === bill.id) {
        skippedNoTwin += 1;
        continue;
      }
      const jobPrefixedTotal = bill.lineItems.reduce((sum, line) => sum + line.amountCents, 0);
      const twinTotal = twin.lineItems.reduce((sum, line) => sum + line.amountCents, 0);
      if (jobPrefixedTotal !== twinTotal) {
        skippedAmount += 1;
        console.log(
          `SKIP amount mismatch ${bill.job.name}: ${num} (${jobPrefixedTotal}) vs ${short} (${twinTotal})`,
        );
        continue;
      }

      wouldVoid += 1;
      console.log(
        `${effectiveDryRun ? "DRY " : ""}VOID ${bill.job.name}: ${num} (${bill.approvalStatus}, $${(jobPrefixedTotal / 100).toFixed(2)}, qbo=${bill.qboBillId ?? "none"}) — keep ${short}`,
      );
      if (!effectiveDryRun) {
        await prisma.bill.update({
          where: { id: bill.id },
          data: { approvalStatus: BillApprovalStatus.VOID },
        });
        voided += 1;
      }
    }

    void jobId;
  }

  console.log(
    JSON.stringify(
      {
        dryRun: effectiveDryRun,
        wouldVoid,
        voided,
        skippedNoTwin,
        skippedAmount,
        jobsScanned: byJob.size,
        billsScanned: bills.length,
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
