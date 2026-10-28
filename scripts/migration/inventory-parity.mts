/**
 * Print a per-module parity inventory for World Construction jobs.
 *
 *   DATABASE_URL=... npx tsx scripts/migration/inventory-parity.mts \
 *     [--org world-construction] [--status OPEN]
 *
 * Used to fill the gap matrix in docs/bt-open-jobs-migration.md after a live
 * count against prod. Never invents data — read-only.
 */

import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";

import { JobStatus } from "../../src/generated/prisma/enums";
import { PrismaClient } from "../../src/generated/prisma/client";

function parseArgs(argv: readonly string[]): Record<string, string> {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
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
const statusFilter = (args.status ?? "OPEN").toUpperCase();

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main() {
  const org = await prisma.organization.findFirst({
    where: { slug: orgSlug },
    select: { id: true, name: true, slug: true },
  });
  if (!org) {
    console.error(`Organization slug "${orgSlug}" not found.`);
    process.exit(1);
  }

  const statusWhere =
    statusFilter === "ALL"
      ? {}
      : { status: statusFilter as JobStatus };

  const jobs = await prisma.job.findMany({
    where: { organizationId: org.id, isTemplate: false, ...statusWhere },
    select: { id: true, name: true, status: true, prefix: true },
    orderBy: { name: "asc" },
  });

  const jobIds = jobs.map((job) => job.id);

  const [
    statusCounts,
    invoices,
    bills,
    pos,
    dailyLogs,
    files,
    scheduleItems,
    estimates,
    proposals,
    budgetLines,
    clients,
    vendors,
  ] = await Promise.all([
    prisma.job.groupBy({
      by: ["status"],
      where: { organizationId: org.id, isTemplate: false },
      _count: { _all: true },
    }),
    prisma.invoice.groupBy({ by: ["jobId"], where: { jobId: { in: jobIds } }, _count: { _all: true } }),
    prisma.bill.groupBy({ by: ["jobId"], where: { jobId: { in: jobIds } }, _count: { _all: true } }),
    prisma.purchaseOrder.groupBy({ by: ["jobId"], where: { jobId: { in: jobIds } }, _count: { _all: true } }),
    prisma.dailyLog.groupBy({ by: ["jobId"], where: { jobId: { in: jobIds } }, _count: { _all: true } }),
    prisma.file.groupBy({ by: ["jobId"], where: { jobId: { in: jobIds }, deletedAt: null }, _count: { _all: true } }),
    prisma.scheduleItem.groupBy({
      by: ["scheduleId"],
      where: { schedule: { jobId: { in: jobIds } } },
      _count: { _all: true },
    }),
    prisma.estimate.groupBy({ by: ["jobId"], where: { jobId: { in: jobIds } }, _count: { _all: true } }),
    prisma.proposal.groupBy({ by: ["jobId"], where: { jobId: { in: jobIds } }, _count: { _all: true } }),
    prisma.budgetLine.groupBy({ by: ["jobId"], where: { jobId: { in: jobIds } }, _count: { _all: true } }),
    prisma.clientJobAccess.groupBy({ by: ["jobId"], where: { jobId: { in: jobIds } }, _count: { _all: true } }),
    prisma.vendorJobAccess.groupBy({ by: ["jobId"], where: { jobId: { in: jobIds } }, _count: { _all: true } }),
  ]);

  const schedules = await prisma.schedule.findMany({
    where: { jobId: { in: jobIds } },
    select: { id: true, jobId: true },
  });
  const scheduleJobById = new Map(schedules.map((row) => [row.id, row.jobId]));
  const scheduleCountByJob = new Map<string, number>();
  for (const row of scheduleItems) {
    const jobId = scheduleJobById.get(row.scheduleId);
    if (!jobId) continue;
    scheduleCountByJob.set(jobId, (scheduleCountByJob.get(jobId) ?? 0) + row._count._all);
  }

  const toMap = (rows: Array<{ jobId: string | null; _count: { _all: number } }>) =>
    new Map(rows.filter((row): row is { jobId: string; _count: { _all: number } } => row.jobId != null).map((row) => [row.jobId, row._count._all]));

  const invoiceMap = toMap(invoices);
  const billMap = toMap(bills);
  const poMap = toMap(pos);
  const logMap = toMap(dailyLogs);
  const fileMap = toMap(files);
  const estimateMap = toMap(estimates);
  const proposalMap = toMap(proposals);
  const budgetMap = toMap(budgetLines);
  const clientMap = toMap(clients);
  const vendorMap = toMap(vendors);

  console.log(JSON.stringify({
    organization: org,
    statusFilter,
    jobStatusTotals: Object.fromEntries(statusCounts.map((row) => [row.status, row._count._all])),
    filteredJobCount: jobs.length,
    moduleTotals: {
      invoices: [...invoiceMap.values()].reduce((a, b) => a + b, 0),
      bills: [...billMap.values()].reduce((a, b) => a + b, 0),
      purchaseOrders: [...poMap.values()].reduce((a, b) => a + b, 0),
      dailyLogs: [...logMap.values()].reduce((a, b) => a + b, 0),
      files: [...fileMap.values()].reduce((a, b) => a + b, 0),
      scheduleItems: [...scheduleCountByJob.values()].reduce((a, b) => a + b, 0),
      estimates: [...estimateMap.values()].reduce((a, b) => a + b, 0),
      proposals: [...proposalMap.values()].reduce((a, b) => a + b, 0),
      budgetLines: [...budgetMap.values()].reduce((a, b) => a + b, 0),
      clientAccess: [...clientMap.values()].reduce((a, b) => a + b, 0),
      vendorAccess: [...vendorMap.values()].reduce((a, b) => a + b, 0),
    },
    jobsWithZero: {
      invoices: jobs.filter((job) => !invoiceMap.has(job.id)).length,
      bills: jobs.filter((job) => !billMap.has(job.id)).length,
      purchaseOrders: jobs.filter((job) => !poMap.has(job.id)).length,
      dailyLogs: jobs.filter((job) => !logMap.has(job.id)).length,
      files: jobs.filter((job) => !fileMap.has(job.id)).length,
      scheduleItems: jobs.filter((job) => !scheduleCountByJob.has(job.id)).length,
      estimates: jobs.filter((job) => !estimateMap.has(job.id)).length,
      proposals: jobs.filter((job) => !proposalMap.has(job.id)).length,
      budgetLines: jobs.filter((job) => !budgetMap.has(job.id)).length,
    },
    jobs: jobs.map((job) => ({
      id: job.id,
      name: job.name,
      status: job.status,
      prefix: job.prefix,
      invoices: invoiceMap.get(job.id) ?? 0,
      bills: billMap.get(job.id) ?? 0,
      purchaseOrders: poMap.get(job.id) ?? 0,
      dailyLogs: logMap.get(job.id) ?? 0,
      files: fileMap.get(job.id) ?? 0,
      scheduleItems: scheduleCountByJob.get(job.id) ?? 0,
      estimates: estimateMap.get(job.id) ?? 0,
      proposals: proposalMap.get(job.id) ?? 0,
      budgetLines: budgetMap.get(job.id) ?? 0,
      clientAccess: clientMap.get(job.id) ?? 0,
      vendorAccess: vendorMap.get(job.id) ?? 0,
    })),
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
