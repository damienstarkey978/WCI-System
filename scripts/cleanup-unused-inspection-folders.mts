/**
 * Clean unused inspection picture folders on OPEN jobs.
 *
 * Safe default (always):
 *   Delete empty FileFolders named like `Inspection: …` that are NOT linked to
 *   any JobPermitInspection (leftovers from collision/ensure races).
 *
 * Optional `--purge-empty-linked`:
 *   Also delete empty linked inspection folders (0 non-deleted photos) via the
 *   same rules as DELETE /folders/{id}: trash photos (none), remove the
 *   JobPermitInspection, delete the FileFolder. Skips any folder with photos.
 *
 *   DATABASE_URL=… npx tsx scripts/cleanup-unused-inspection-folders.mts \
 *     [--org world-construction] [--dry-run] [--purge-empty-linked]
 */

import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client";
import { JobStatus } from "../src/generated/prisma/enums";

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
const purgeEmptyLinked = args["purge-empty-linked"] === "true";

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

function isInspectionFolderName(name: string): boolean {
  return /^inspection:\s+/i.test(name.trim());
}

async function main() {
  const org = await prisma.organization.findFirst({
    where: { slug: orgSlug },
    select: { id: true, name: true, slug: true },
  });
  if (!org) {
    console.error(`Organization slug "${orgSlug}" not found.`);
    process.exit(1);
  }

  console.log(
    `${dryRun ? "DRY-RUN" : "APPLY"} org=${org.slug} purgeEmptyLinked=${purgeEmptyLinked}`,
  );

  const jobs = await prisma.job.findMany({
    where: { organizationId: org.id, isTemplate: false, status: JobStatus.OPEN },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  let unlinkedDeleted = 0;
  let linkedDeleted = 0;
  let skippedWithPhotos = 0;
  const perJob: {
    jobId: string;
    name: string;
    unlinked: string[];
    linkedEmpty: string[];
    skippedPhotos: string[];
  }[] = [];

  for (const job of jobs) {
    const folders = await prisma.fileFolder.findMany({
      where: { jobId: job.id, organizationId: org.id },
      select: {
        id: true,
        name: true,
        inspections: { select: { id: true, name: true } },
        _count: { select: { files: { where: { deletedAt: null } } } },
      },
      orderBy: { name: "asc" },
    });

    const unlinked: string[] = [];
    const linkedEmpty: string[] = [];
    const skippedPhotos: string[] = [];

    for (const folder of folders) {
      const linked = folder.inspections.length > 0;
      const empty = folder._count.files === 0;
      const inspectionNamed = isInspectionFolderName(folder.name);

      if (!linked && inspectionNamed && empty) {
        unlinked.push(`${folder.name} (${folder.id})`);
        if (!dryRun) {
          await prisma.fileFolder.delete({ where: { id: folder.id } });
        }
        unlinkedDeleted += 1;
        continue;
      }

      if (purgeEmptyLinked && linked && empty) {
        linkedEmpty.push(
          `${folder.name} → ${folder.inspections.map((i) => i.name).join(", ")} (${folder.id})`,
        );
        if (!dryRun) {
          await prisma.jobPermitInspection.deleteMany({
            where: { id: { in: folder.inspections.map((i) => i.id) } },
          });
          await prisma.fileFolder.delete({ where: { id: folder.id } });
        }
        linkedDeleted += 1;
        continue;
      }

      if (linked && !empty && purgeEmptyLinked) {
        skippedPhotos.push(`${folder.name} (${folder._count.files} photos)`);
        skippedWithPhotos += 1;
      }
    }

    if (unlinked.length > 0 || linkedEmpty.length > 0 || skippedPhotos.length > 0) {
      perJob.push({
        jobId: job.id,
        name: job.name,
        unlinked,
        linkedEmpty,
        skippedPhotos,
      });
    }
  }

  for (const row of perJob) {
    console.log(`\n${row.name} (${row.jobId})`);
    if (row.unlinked.length) {
      console.log(`  unlinked empty: ${row.unlinked.join("; ")}`);
    }
    if (row.linkedEmpty.length) {
      console.log(`  linked empty: ${row.linkedEmpty.join("; ")}`);
    }
    if (row.skippedPhotos.length) {
      console.log(`  skipped (has photos): ${row.skippedPhotos.join("; ")}`);
    }
  }

  console.log(
    `\nSummary: OPEN jobs=${jobs.length} unlinkedDeleted=${unlinkedDeleted} ` +
      `linkedDeleted=${linkedDeleted} skippedWithPhotos=${skippedWithPhotos} dryRun=${dryRun}`,
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
