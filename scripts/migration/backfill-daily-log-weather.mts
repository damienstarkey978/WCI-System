/**
 * Backfill DailyLog.weather from the BT grid export for rows that already
 * match (jobId, createdAt, note) but have null weather — e.g. imports that
 * hit prod before the migration API accepted a weather field.
 *
 * Never invents weather: only copies BT weatherInformation when present.
 */
import "dotenv/config";
import fs from "node:fs";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../../src/generated/prisma/client";

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

type BtLog = {
  jobsiteName: string;
  logDate: string;
  logTitle: string | null;
  logNotes: string | null;
  addedBy: string;
  weatherInformation?: Record<string, unknown> | null;
};

function buildNote(log: BtLog): string {
  const prefix = `[Imported from Buildertrend. Original author: ${log.addedBy}]`;
  const title = (log.logTitle ?? "").replace(/\uFFFC/g, "");
  const notes = (log.logNotes ?? "").trimEnd();
  if (title.length > 0 && notes.length > 0) return `${prefix} ${title}\n\n${notes}`;
  if (title.length > 0) return `${prefix} ${title}`;
  if (notes.length > 0) return `${prefix}\n\n${notes}`;
  return prefix;
}

async function main() {
  const jobMap = JSON.parse(
    fs.readFileSync("/cursor/stores/self/docs/bt-exports/bt-to-wci-job-map.json", "utf8"),
  ) as Array<{ btName: string; wciId: string }>;
  const nameToId = new Map(jobMap.map((j) => [j.btName.trim(), j.wciId]));
  const logs = JSON.parse(
    fs.readFileSync(
      "/cursor/stores/self/docs/bt-exports/DailyLogs_AllOpenJobs_grid.json",
      "utf8",
    ),
  ) as BtLog[];

  let updated = 0;
  let skippedNoWeather = 0;
  let skippedHasWeather = 0;
  let missing = 0;

  for (const log of logs) {
    const jobId = nameToId.get(log.jobsiteName.trim());
    if (!jobId) continue;
    const w = log.weatherInformation;
    if (!w || (w.conditions == null && w.maxTemp == null && w.minTemp == null)) {
      skippedNoWeather += 1;
      continue;
    }
    const note = buildNote(log);
    const createdAt = new Date(log.logDate);
    const row = await db.dailyLog.findFirst({
      where: { jobId, createdAt, note },
      select: { id: true, weather: true },
    });
    if (!row) {
      missing += 1;
      continue;
    }
    if (row.weather != null) {
      skippedHasWeather += 1;
      continue;
    }
    await db.dailyLog.update({ where: { id: row.id }, data: { weather: w } });
    updated += 1;
  }

  console.log(JSON.stringify({ updated, skippedNoWeather, skippedHasWeather, missing }, null, 2));
  await db.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await db.$disconnect();
  process.exit(1);
});
