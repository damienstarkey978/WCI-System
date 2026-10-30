/**
 * Cancel (void) JOB_*-prefixed Purchase Order clones that double-count against a
 * real BT PO on the same job (Heather 1pm bug #8).
 *
 * Pattern after dual BT imports: `JOB_755B-0025` (vendor "Unassigned") +
 * `J144-PO-0025` (real vendor, same line total) both APPROVED → committed cost
 * counts twice. CANCELLED is excluded from the commitment funnel
 * (src/lib/budget/funnel.ts isCommittedStatus).
 *
 * Prefer keeping the non-JOB_* number (J*-PO-*, street-prefix, bare). Cancel the
 * Unassigned JOB_* twin when totals match. Also cancel Unassigned JOB_* orphans
 * with no twin — those are import ghosts, not real commitments.
 *
 *   DATABASE_URL=… npx tsx scripts/migration/void-job-prefixed-po-dups.mts \
 *     [--org world-construction] [--dry-run] [--apply] [--job job_…]
 *
 * Does not touch QBO.
 */

import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../../src/generated/prisma/client";
import { PurchaseOrderStatus } from "../../src/generated/prisma/enums";
import { extendedCostCents } from "../../src/lib/budget/funnel";

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

/** `JOB_755B-0025` → `0025`; `JOB_755B-0132 Draw 2` → `0132 Draw 2`. */
function shortSiblingNumber(jobPrefixed: string): string | null {
  const match = /^JOB_[A-Za-z0-9]+-(.+)$/i.exec(jobPrefixed.trim());
  return match?.[1] ?? null;
}

/** Canonical BT PO id for matching J144-PO-0025 ↔ JOB_755B-0025 ↔ 0025. */
function canonicalPoSuffix(poNumber: string): string | null {
  const n = poNumber.trim();
  const job = shortSiblingNumber(n);
  if (job) return normalizeSuffix(job);
  const jPo = /^J\d+-PO-(.+)$/i.exec(n);
  if (jPo) return normalizeSuffix(jPo[1]);
  // Bare / street-prefixed numeric: take trailing zero-padded token when present.
  const bare = /^(\d+)$/.exec(n);
  if (bare) return normalizeSuffix(bare[1]);
  return null;
}

function normalizeSuffix(raw: string): string {
  const s = raw.trim();
  if (/^\d+$/.test(s)) return String(parseInt(s, 10));
  const labeled = /^0*(\d+)(\s+.+)$/.exec(s);
  if (labeled) return `${parseInt(labeled[1], 10)}${labeled[2]}`;
  return s.replace(/^0+(\d)/, "$1");
}

function isUnassignedVendor(name: string | null | undefined): boolean {
  const v = (name ?? "").trim().toLowerCase();
  return v === "" || v === "unassigned" || v === "unknown vendor" || v === "unknown";
}

function lineTotalCents(lineItems: readonly { quantityMilli: number; unitCostCents: number }[]): number {
  return lineItems.reduce(
    (sum, item) => sum + extendedCostCents(item.quantityMilli, item.unitCostCents),
    0,
  );
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

  const purchaseOrders = await prisma.purchaseOrder.findMany({
    where: {
      organizationId: org.id,
      status: { not: PurchaseOrderStatus.CANCELLED },
      ...(jobFilter ? { jobId: jobFilter } : {}),
    },
    select: {
      id: true,
      jobId: true,
      poNumber: true,
      vendorName: true,
      status: true,
      lineItems: { select: { quantityMilli: true, unitCostCents: true } },
      job: { select: { name: true, status: true } },
    },
  });

  const byJob = new Map<string, typeof purchaseOrders>();
  for (const po of purchaseOrders) {
    const list = byJob.get(po.jobId) ?? [];
    list.push(po);
    byJob.set(po.jobId, list);
  }

  let wouldCancel = 0;
  let cancelled = 0;
  let cancelledWithTwin = 0;
  let cancelledOrphan = 0;
  let skippedAssigned = 0;
  let skippedAmount = 0;

  for (const [, jobPos] of byJob) {
    const keepersByCanon = new Map<string, (typeof purchaseOrders)[number]>();
    for (const po of jobPos) {
      if (po.poNumber.startsWith("JOB_")) continue;
      const canon = canonicalPoSuffix(po.poNumber);
      if (!canon) continue;
      const existing = keepersByCanon.get(canon);
      // Prefer a named vendor over Unassigned if both somehow non-JOB_.
      if (!existing || (isUnassignedVendor(existing.vendorName) && !isUnassignedVendor(po.vendorName))) {
        keepersByCanon.set(canon, po);
      }
    }

    for (const po of jobPos) {
      if (!po.poNumber.startsWith("JOB_")) continue;
      if (!isUnassignedVendor(po.vendorName)) {
        skippedAssigned += 1;
        continue;
      }

      const canon = canonicalPoSuffix(po.poNumber);
      const twin = canon ? keepersByCanon.get(canon) : undefined;
      const jobTotal = lineTotalCents(po.lineItems);

      if (twin) {
        const twinTotal = lineTotalCents(twin.lineItems);
        if (twinTotal !== jobTotal) {
          skippedAmount += 1;
          console.log(
            `SKIP amount mismatch ${po.job.name}: ${po.poNumber} (${jobTotal}) vs ${twin.poNumber} (${twinTotal})`,
          );
          continue;
        }
        wouldCancel += 1;
        cancelledWithTwin += 1;
        console.log(
          `${effectiveDryRun ? "DRY " : ""}CANCEL ${po.job.name} [${po.job.status}]: ${po.poNumber} (${po.status}, $${(jobTotal / 100).toFixed(2)}, Unassigned) — keep ${twin.poNumber}`,
        );
      } else {
        // Unassigned JOB_* with no real twin — still a ghost commitment.
        wouldCancel += 1;
        cancelledOrphan += 1;
        console.log(
          `${effectiveDryRun ? "DRY " : ""}CANCEL orphan ${po.job.name} [${po.job.status}]: ${po.poNumber} (${po.status}, $${(jobTotal / 100).toFixed(2)}, Unassigned) — no twin`,
        );
      }

      if (!effectiveDryRun) {
        await prisma.purchaseOrder.update({
          where: { id: po.id },
          data: { status: PurchaseOrderStatus.CANCELLED, recalledAt: new Date() },
        });
        cancelled += 1;
      }
    }
  }

  console.log(
    JSON.stringify(
      {
        dryRun: effectiveDryRun,
        wouldCancel,
        cancelled,
        cancelledWithTwin,
        cancelledOrphan,
        skippedAssigned,
        skippedAmount,
        jobsScanned: byJob.size,
        posScanned: purchaseOrders.length,
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
