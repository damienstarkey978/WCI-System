/**
 * Heal OPEN jobs that have a locked/sent estimate (or any estimate with lines)
 * but zero BudgetLine rows — the gap left when importApprovedProposal returned
 * early without send-to-budget.
 *
 *   DATABASE_URL=… npx tsx scripts/migration/heal-budgets-from-estimates.mts \
 *     [--org world-construction] [--dry-run]
 *
 * Does not invent budgets for jobs with no estimate (Secluded Oaks / Lem Turner /
 * Oakwood / Mallory class) — those need a real BT proposal or staff entry.
 */

import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";

import { sendEstimateToBudget } from "../../src/lib/budget/send-to-budget";
import { PrismaClient } from "../../src/generated/prisma/client";
import { JobStatus } from "../../src/generated/prisma/enums";

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
const dryRun = args["dry-run"] === "true";

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

  const jobs = await prisma.job.findMany({
    where: { organizationId: org.id, isTemplate: false, status: JobStatus.OPEN },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  let healed = 0;
  let skippedWithBudget = 0;
  let skippedNoEstimate = 0;

  for (const job of jobs) {
    const budgetLineCount = await prisma.budgetLine.count({ where: { jobId: job.id } });
    if (budgetLineCount > 0) {
      skippedWithBudget += 1;
      continue;
    }

    const estimate =
      (await prisma.estimate.findFirst({
        where: {
          organizationId: org.id,
          jobId: job.id,
          sentToBudgetAt: { not: null },
          lineItems: { some: {} },
        },
        orderBy: { sentToBudgetAt: "desc" },
        select: { id: true, title: true, sentToBudgetAt: true },
      })) ??
      (await prisma.estimate.findFirst({
        where: { organizationId: org.id, jobId: job.id, lineItems: { some: {} } },
        orderBy: { updatedAt: "desc" },
        select: { id: true, title: true, sentToBudgetAt: true },
      }));

    if (!estimate) {
      skippedNoEstimate += 1;
      console.log(`SKIP (no estimate lines): ${job.name}`);
      continue;
    }

    console.log(
      `${dryRun ? "DRY-RUN would heal" : "HEAL"}: ${job.name} ← estimate ${estimate.id} (${estimate.title})`,
    );
    if (dryRun) {
      healed += 1;
      continue;
    }

    const result = await sendEstimateToBudget({
      estimateId: estimate.id,
      organizationId: org.id,
      allowResend: estimate.sentToBudgetAt !== null,
    });
    console.log(`  wrote ${result.budgetLinesWritten} lines; client ${result.totalClientPriceCents}¢`);
    healed += 1;
  }

  console.log(
    JSON.stringify(
      {
        org: org.slug,
        openJobs: jobs.length,
        healed,
        skippedWithBudget,
        skippedNoEstimate,
        dryRun,
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
