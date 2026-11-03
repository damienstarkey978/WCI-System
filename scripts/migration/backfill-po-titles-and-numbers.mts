/**
 * Backfill PurchaseOrder.title from the first line-item title when null/blank,
 * and optionally normalize import prefixes (J167-PO-0011 → 0011) when the short
 * number is free. Buildertrend Standard View shows short numbers + trade titles.
 *
 * CANCELLED JOB_* twins stay CANCELLED (void-job-prefixed-po-dups.mts); the list
 * UI hides them by default.
 *
 *   DATABASE_URL=… npx tsx scripts/migration/backfill-po-titles-and-numbers.mts \
 *     [--org world-construction] [--job job_…] [--dry-run] [--apply] [--normalize-numbers]
 */
import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../../src/generated/prisma/client";
import { formatPoNumberDisplay } from "../../src/lib/purchase-orders/display";

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

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const args = parseArgs(process.argv.slice(2));
const orgSlug = args.org ?? "world-construction";
const apply = args.apply === "true";
const normalizeNumbers = args["normalize-numbers"] === "true";
const jobFilter = args.job;

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main() {
  const dryRun = !apply;
  const org = await prisma.organization.findFirst({
    where: { OR: [{ slug: orgSlug }, { name: { contains: "World Construction", mode: "insensitive" } }] },
    select: { id: true, name: true, slug: true },
  });
  if (!org) {
    console.error(`No organization matching ${orgSlug}`);
    process.exit(1);
  }
  console.log(`Org ${org.name} — ${dryRun ? "DRY RUN" : "APPLY"}${normalizeNumbers ? " + normalize numbers" : ""}`);

  const purchaseOrders = await prisma.purchaseOrder.findMany({
    where: {
      organizationId: org.id,
      ...(jobFilter ? { jobId: jobFilter } : {}),
    },
    select: {
      id: true,
      jobId: true,
      poNumber: true,
      title: true,
      status: true,
      lineItems: { orderBy: { sortOrder: "asc" }, take: 1, select: { title: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const usedNumbers = new Set(purchaseOrders.map((po) => po.poNumber.trim()));
  let titleUpdates = 0;
  let numberUpdates = 0;

  for (const po of purchaseOrders) {
    const data: { title?: string; poNumber?: string } = {};
    const lineTitle = po.lineItems[0]?.title?.trim() || null;
    if (!po.title?.trim() && lineTitle) {
      data.title = lineTitle.replace(/:\s*$/, "");
    }

    if (normalizeNumbers && po.status !== "CANCELLED") {
      const short = formatPoNumberDisplay(po.poNumber);
      if (short !== po.poNumber.trim() && /^\d{4}$/.test(short) && !usedNumbers.has(short)) {
        data.poNumber = short;
        usedNumbers.add(short);
        usedNumbers.delete(po.poNumber.trim());
      }
    }

    if (Object.keys(data).length === 0) continue;

    console.log(
      `${po.status.padEnd(12)} ${po.poNumber.padEnd(16)} →` +
        `${data.poNumber ? ` number=${data.poNumber}` : ""}` +
        `${data.title ? ` title="${data.title}"` : ""}`,
    );
    if (data.title) titleUpdates += 1;
    if (data.poNumber) numberUpdates += 1;

    if (!dryRun) {
      await prisma.purchaseOrder.update({ where: { id: po.id }, data });
    }
  }

  console.log(
    `\n${dryRun ? "Would update" : "Updated"} titles=${titleUpdates} numbers=${numberUpdates} (of ${purchaseOrders.length} POs)`,
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
