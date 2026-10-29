import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client";
import fs from "fs";

function parseCsv(text: string): Record<string, string>[] {
  const lines: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (inQ && text[i + 1] === '"') {
        cur += '"';
        i++;
      } else inQ = !inQ;
      continue;
    }
    if (c === "\n" && !inQ) {
      lines.push(cur);
      cur = "";
      continue;
    }
    if (c === "\r") continue;
    cur += c;
  }
  if (cur) lines.push(cur);
  const header = splitCsvLine(lines[0]);
  return lines.slice(1).filter(Boolean).map((line) => {
    const cols = splitCsvLine(line);
    const row: Record<string, string> = {};
    header.forEach((h, i) => (row[h] = cols[i] ?? ""));
    return row;
  });
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQ && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else inQ = !inQ;
      continue;
    }
    if (c === "," && !inQ) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += c;
  }
  out.push(cur);
  return out;
}

function norm(s: string) {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

async function main() {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
  });
  const csv = parseCsv(
    fs.readFileSync(
      "/cursor/stores/bc-01a17807-bb2b-7977-80c5-3491017e6440/docs/bt-exports/Schedule_all_open_jobs.csv",
      "utf8",
    ),
  );
  const json = JSON.parse(
    fs.readFileSync(
      "/cursor/stores/bc-01a17807-bb2b-7977-80c5-3491017e6440/docs/bt-exports/Schedule_AllOpenJobs.json",
      "utf8",
    ),
  );
  const offlineByName = new Map<string, boolean>(
    (json.jobs || []).map((j: any) => [j.name as string, !!j.calendarOffline]),
  );

  const btByJob = new Map<string, Record<string, string>[]>();
  for (const r of csv) {
    const arr = btByJob.get(r.Job) || [];
    arr.push(r);
    btByJob.set(r.Job, arr);
  }

  const org = await prisma.organization.findFirst({
    where: { slug: "world-construction" },
  });
  const jobs = await prisma.job.findMany({
    where: { organizationId: org!.id, status: "OPEN" },
    orderBy: { name: "asc" },
  });

  const report = [];
  for (const job of jobs) {
    let items: Record<string, string>[] = [];
    for (const [k, v] of btByJob) {
      if (norm(k) === norm(job.name)) {
        items = v;
        break;
      }
    }
    if (!items.length) {
      const pref = job.prefix || job.name.match(/^\d+/)?.[0] || "";
      for (const [k, v] of btByJob) {
        if (k.startsWith(pref + " ") || k.startsWith(pref + "-") || k.startsWith(pref)) {
          items = v;
          break;
        }
      }
    }

    const sched = await prisma.schedule.findFirst({
      where: { jobId: job.id },
      include: { items: true },
    });
    const wciItems = sched?.items || [];
    const mismatches: any[] = [];
    for (const b of items) {
      const title = b.Title;
      const start = (b.StartDate || "").slice(0, 10);
      const dur = Number(b.Duration) || 1;
      const completed = String(b.Completed).toLowerCase() === "true";
      const w = wciItems.find((i) => i.title === title);
      if (!w) {
        mismatches.push({ type: "missing", title, start, dur });
        continue;
      }
      const wStart = w.manualStartDate
        ? w.manualStartDate.toISOString().slice(0, 10)
        : null;
      if (wStart !== start)
        mismatches.push({ type: "start", title, bt: start, wci: wStart });
      if (w.durationDays !== dur)
        mismatches.push({ type: "duration", title, bt: dur, wci: w.durationDays });
      if (completed && w.percentCompleteBasisPoints < 10000)
        mismatches.push({
          type: "complete",
          title,
          wci: w.percentCompleteBasisPoints,
        });
    }
    for (const w of wciItems) {
      if (!items.find((b) => b.Title === w.title))
        mismatches.push({
          type: "extra_wci",
          title: w.title,
          start: w.manualStartDate?.toISOString().slice(0, 10),
        });
    }

    let btOffline: boolean | null = null;
    for (const [k, v] of offlineByName) {
      if (norm(k) === norm(job.name)) {
        btOffline = v;
        break;
      }
    }
    const onlineMismatch =
      btOffline == null || sched == null
        ? null
        : sched.isOnline !== !btOffline;

    report.push({
      id: job.id,
      name: job.name,
      btCount: items.length,
      wciCount: wciItems.length,
      isOnline: sched?.isOnline ?? null,
      isDraft: sched?.isDraft ?? null,
      btCalendarOffline: btOffline,
      onlineMismatch,
      mismatchCount: mismatches.length,
      mismatches,
    });
  }

  fs.writeFileSync("/tmp/schedule-compare.json", JSON.stringify(report, null, 2));
  const fail = report.filter(
    (r) => r.btCount !== r.wciCount || r.mismatchCount > 0 || r.onlineMismatch,
  );
  console.log(
    JSON.stringify(
      {
        jobs: report.length,
        fail: fail.length,
        failNames: fail.map((f) => ({
          name: f.name,
          bt: f.btCount,
          wci: f.wciCount,
          onlineMismatch: f.onlineMismatch,
          btOffline: f.btCalendarOffline,
          isOnline: f.isOnline,
          mismatches: f.mismatchCount,
          sample: f.mismatches.slice(0, 3),
        })),
        passEmptyOk: report
          .filter((r) => r.btCount === 0 && r.wciCount === 0)
          .map((r) => r.name),
      },
      null,
      2,
    ),
  );
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
