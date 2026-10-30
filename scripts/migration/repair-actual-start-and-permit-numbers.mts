/**
 * One-shot data repair (Heather 1pm bugs New #5 + New #7 / Still broken #11):
 *
 * 1. Clear Job.actualStart when it was stamped by PRE_SALE→OPEN at import time
 *    (matches JobStatusEvent.createdAt within 2s) and projectedStart is null.
 * 2. Copy BUILDING JobPermit.permitNumber → Job.permitNumber when the job's
 *    permitNumber is null/blank.
 *
 *   DATABASE_URL=… npx tsx scripts/migration/repair-actual-start-and-permit-numbers.mts
 *   DATABASE_URL=… npx tsx scripts/migration/repair-actual-start-and-permit-numbers.mts --apply
 */

import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../../src/generated/prisma/client";
import { PermitTrade } from "../../src/generated/prisma/enums";

const APPLY = process.argv.includes("--apply");

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  try {
    const jobs = await db.job.findMany({
      where: { status: "OPEN", actualStart: { not: null }, projectedStart: null },
      select: {
        id: true,
        name: true,
        actualStart: true,
        permitNumber: true,
        statusEvents: {
          where: { from: "PRE_SALE", to: "OPEN" },
          orderBy: { createdAt: "asc" },
          take: 1,
          select: { createdAt: true, reason: true },
        },
      },
    });

    const clearActual: Array<{ id: string; name: string; actualStart: Date; eventAt: Date }> = [];
    for (const job of jobs) {
      const event = job.statusEvents[0];
      if (!event || !job.actualStart) continue;
      const delta = Math.abs(job.actualStart.getTime() - event.createdAt.getTime());
      if (delta <= 2_000) {
        clearActual.push({
          id: job.id,
          name: job.name,
          actualStart: job.actualStart,
          eventAt: event.createdAt,
        });
      }
    }

    const buildingPermits = await db.jobPermit.findMany({
      where: {
        trade: PermitTrade.BUILDING,
        permitNumber: { not: null },
        job: { OR: [{ permitNumber: null }, { permitNumber: "" }] },
      },
      select: {
        id: true,
        permitNumber: true,
        jobId: true,
        job: { select: { name: true, permitNumber: true } },
      },
      orderBy: { updatedAt: "desc" },
    });

    // One Building permit number per job (prefer the most recently updated with a number).
    const syncPermit: Array<{ jobId: string; jobName: string; permitNumber: string }> = [];
    const seenJobs = new Set<string>();
    for (const p of buildingPermits) {
      const num = p.permitNumber?.trim();
      if (!num || seenJobs.has(p.jobId)) continue;
      seenJobs.add(p.jobId);
      syncPermit.push({ jobId: p.jobId, jobName: p.job.name, permitNumber: num });
    }

    console.log(
      JSON.stringify(
        {
          dryRun: !APPLY,
          clearActualStart: { count: clearActual.length, sample: clearActual.slice(0, 10) },
          syncJobPermitNumber: { count: syncPermit.length, sample: syncPermit.slice(0, 10) },
        },
        null,
        2,
      ),
    );

    if (!APPLY) {
      console.log("Re-run with --apply to write.");
      return;
    }

    for (const row of clearActual) {
      await db.job.update({ where: { id: row.id }, data: { actualStart: null } });
    }
    for (const row of syncPermit) {
      await db.job.update({ where: { id: row.jobId }, data: { permitNumber: row.permitNumber } });
    }
    console.log(`Applied: cleared ${clearActual.length} actualStart; synced ${syncPermit.length} permitNumber.`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
