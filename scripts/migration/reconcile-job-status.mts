/**
 * Close WCI jobs that are no longer Open in Buildertrend.
 *
 * Usage:
 *   DATABASE_URL=... npx tsx scripts/migration/reconcile-job-status.mts \
 *     --bt-open-jobs /path/to/bt-open-job-names.txt \
 *     [--org world-construction] [--dry-run]
 *
 * The BT open-jobs file is one job name per line (exact Buildertrend Job name,
 * trailing whitespace ignored). Every WCI Job that is currently OPEN or WARRANTY
 * whose name is NOT in that list is moved to CLOSED via transitionJobStatus —
 * never by assigning Job.status directly.
 *
 * Does not invent financial data. Does not reopen CLOSED jobs.
 */

import "dotenv/config";

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { PrismaPg } from "@prisma/adapter-pg";

import { JobStatus, UserRole } from "../../src/generated/prisma/enums";
import { PrismaClient } from "../../src/generated/prisma/client";
import { transitionJobStatus } from "../../src/lib/jobs";

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

function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const args = parseArgs(process.argv.slice(2));
const orgSlug = args.org ?? "world-construction";
const dryRun = args["dry-run"] === "true";
if (!args["bt-open-jobs"]) {
  console.error("Pass --bt-open-jobs with a newline-delimited list of currently Open Buildertrend job names.");
  process.exit(1);
}
const listPath = resolve(args["bt-open-jobs"]);

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

  const admin = await prisma.user.findFirst({
    where: { organizationId: org.id, role: UserRole.ADMIN },
    select: { id: true, role: true, email: true },
  });
  if (!admin) {
    console.error("No ADMIN user in this org — needed as the actor for CLOSED transitions.");
    process.exit(1);
  }

  const openNames = new Set(
    readFileSync(listPath, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"))
      .map(normalizeName),
  );
  console.log(`Org: ${org.name} (${org.slug})`);
  console.log(`BT open job names loaded: ${openNames.size}`);
  console.log(`Actor: ${admin.email} (${admin.id})`);
  console.log(dryRun ? "DRY RUN — no status writes." : "LIVE — will close unmatched OPEN/WARRANTY jobs.");

  const candidates = await prisma.job.findMany({
    where: {
      organizationId: org.id,
      isTemplate: false,
      status: { in: [JobStatus.OPEN, JobStatus.WARRANTY, JobStatus.PRE_SALE] },
    },
    select: { id: true, name: true, status: true, prefix: true },
    orderBy: { name: "asc" },
  });

  const stillOpen: typeof candidates = [];
  const toClose: typeof candidates = [];
  for (const job of candidates) {
    if (openNames.has(normalizeName(job.name))) {
      stillOpen.push(job);
    } else if (job.status === JobStatus.PRE_SALE) {
      // Leave pre-sale alone — BT "Open" list doesn't cover CRM pipeline.
      stillOpen.push(job);
    } else {
      toClose.push(job);
    }
  }

  const unmatchedBt = [...openNames].filter(
    (name) => !candidates.some((job) => normalizeName(job.name) === name),
  );

  console.log(`\nWCI still matching BT open (or PRE_SALE kept): ${stillOpen.length}`);
  console.log(`WCI to close (OPEN/WARRANTY not in BT open list): ${toClose.length}`);
  console.log(`BT open names with no WCI Job match: ${unmatchedBt.length}`);

  for (const job of toClose) {
    console.log(`  CLOSE ${job.status} → CLOSED  ${job.prefix ?? "—"}  ${job.name}  (${job.id})`);
    if (!dryRun) {
      await transitionJobStatus({
        jobId: job.id,
        organizationId: org.id,
        to: JobStatus.CLOSED,
        actor: { kind: "user", userId: admin.id, role: admin.role },
        reason: "Buildertrend cutover: job no longer Open in Buildertrend",
      });
    }
  }

  if (unmatchedBt.length > 0) {
    console.log("\nBT open names missing in WCI (create/import these jobs first):");
    for (const name of unmatchedBt.slice(0, 100)) {
      console.log(`  ${name}`);
    }
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
