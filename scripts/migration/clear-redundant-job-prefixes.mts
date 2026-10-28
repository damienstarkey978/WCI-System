/**
 * One-shot repair: clear Job.prefix when the job name already leads with that
 * prefix (WCI-66 / BT open-job creates). Matches older Buildertrend imports
 * that left prefix null and put the street number only in `name`.
 *
 *   DATABASE_URL=... npx tsx scripts/migration/clear-redundant-job-prefixes.mts \
 *     [--org world-construction] [--dry-run]
 *
 * Safe to re-run: already-null prefixes are skipped.
 */

import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../../src/generated/prisma/client";
import { jobNameAlreadyIncludesPrefix } from "../../src/lib/job-display";

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
const dryRun = args["dry-run"] === "true";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

async function main() {
  const org = await prisma.organization.findFirst({
    where: { slug: orgSlug },
    select: { id: true, name: true, slug: true },
  });
  if (!org) {
    console.error(`No organization with slug "${orgSlug}".`);
    process.exit(1);
  }

  const jobs = await prisma.job.findMany({
    where: { organizationId: org.id, prefix: { not: null } },
    select: { id: true, name: true, prefix: true, status: true },
    orderBy: { createdAt: "desc" },
  });

  const redundant = jobs.filter((job) => jobNameAlreadyIncludesPrefix(job.name, job.prefix));

  console.log(`Org: ${org.name} (${org.slug})`);
  console.log(`Jobs with prefix: ${jobs.length}`);
  console.log(`Redundant (name already leads with prefix): ${redundant.length}`);
  if (dryRun) console.log("DRY RUN — no updates.");

  for (const job of redundant) {
    console.log(`  CLEAR prefix="${job.prefix}"  ${job.status}  ${job.name}  (${job.id})`);
    if (!dryRun) {
      await prisma.job.update({ where: { id: job.id }, data: { prefix: null } });
    }
  }

  console.log(dryRun ? "Dry run complete." : `Cleared ${redundant.length} prefix(es).`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
