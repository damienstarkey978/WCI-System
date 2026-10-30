/**
 * Import Buildertrend Daily Logs grid export into WCI via
 * POST /api/v1/migration/daily-logs (idempotent on jobId+createdAt+note).
 *
 * Note shape matches the prior cutover import so re-runs hit already_exists:
 *   [Imported from Buildertrend. Original author: {addedBy}] {title}\n\n{notes}
 * Title trailing spaces are preserved (BT + prior WCI rows keep them).
 * authorUserId is Damien (only staff User that prior imports used); BT author
 * is preserved in the note prefix — do not invent Users for Mark/Garry/subs.
 *
 *   set -a; source /tmp/wci-full.env; set +a
 *   npx tsx scripts/migration/import_bt_daily_logs.mts \
 *     --grid /cursor/stores/self/docs/bt-exports/DailyLogs_AllOpenJobs_grid.json \
 *     --job-map /cursor/stores/self/docs/bt-exports/bt-to-wci-job-map.json
 */

import "dotenv/config";
import fs from "node:fs";

type BtLog = {
  dailyLogId: number;
  jobsiteName: string;
  logDate: string;
  logTitle: string | null;
  logNotes: string | null;
  addedBy: string;
  viewableBy?: { owner?: boolean; subs?: boolean; internalUsers?: boolean };
  weatherInformation?: Record<string, unknown> | null;
};

type JobMapRow = { btName: string; wciId: string };

function parseArgs(argv: readonly string[]): Record<string, string> {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) args[key] = "true";
    else {
      args[key] = next;
      i += 1;
    }
  }
  return args;
}

function buildNote(log: BtLog): string {
  const prefix = `[Imported from Buildertrend. Original author: ${log.addedBy}]`;
  // Keep trailing spaces on title — prior WCI imports did; trimming breaks idempotency.
  const title = (log.logTitle ?? "").replace(/\uFFFC/g, "");
  const notes = (log.logNotes ?? "").trimEnd();
  if (title.length > 0 && notes.length > 0) return `${prefix} ${title}\n\n${notes}`;
  if (title.length > 0) return `${prefix} ${title}`;
  if (notes.length > 0) return `${prefix}\n\n${notes}`;
  return prefix;
}

function weatherPayload(log: BtLog): Record<string, unknown> | undefined {
  const w = log.weatherInformation;
  if (!w || typeof w !== "object") return undefined;
  // Only pass through when BT actually recorded something (conditions or temps).
  if (w.conditions == null && w.maxTemp == null && w.minTemp == null) return undefined;
  return w;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const gridPath =
    args.grid ?? "/cursor/stores/self/docs/bt-exports/DailyLogs_AllOpenJobs_grid.json";
  const jobMapPath =
    args["job-map"] ?? "/cursor/stores/self/docs/bt-exports/bt-to-wci-job-map.json";
  const apiBase = (process.env.APP_BASE_URL ?? "https://app.worldconstructionjax.com").replace(
    /\/$/,
    "",
  );
  const apiKey = process.env.WCI_MIGRATION_API_KEY;
  const authorUserId =
    args["author-user-id"] ?? "9f121a70-9250-479e-891e-a6b813057416"; // Damien Starkey

  if (!apiKey) {
    console.error("WCI_MIGRATION_API_KEY is not set.");
    process.exit(1);
  }

  const logs = JSON.parse(fs.readFileSync(gridPath, "utf8")) as BtLog[];
  const jobMap = JSON.parse(fs.readFileSync(jobMapPath, "utf8")) as JobMapRow[];
  // Index by trimmed name — BT grid rows sometimes carry a trailing space on jobsiteName.
  const nameToId = new Map(jobMap.map((j) => [j.btName.trim(), j.wciId]));

  const skippedUnmapped: string[] = [];
  const payload: Array<{
    jobId: string;
    authorUserId: string;
    note: string;
    clientVisible: boolean;
    subVisible: boolean;
    createdAt: string;
    logDate: string;
    weather?: Record<string, unknown>;
    _btId: number;
    _jobName: string;
  }> = [];

  for (const log of logs) {
    const jobId = nameToId.get(log.jobsiteName.trim());
    if (!jobId) {
      skippedUnmapped.push(log.jobsiteName);
      continue;
    }
    const note = buildNote(log);
    if (note.length > 10_000) {
      console.warn(`skip oversized note dailyLogId=${log.dailyLogId} len=${note.length}`);
      continue;
    }
    const weather = weatherPayload(log);
    // logDate is the calendar day (YYYY-MM-DD). createdAt keeps a full timestamp for
    // idempotency; when BT only gives a date, pin createdAt to UTC noon so Eastern
    // does not see the previous calendar day.
    const logDateYmd = String(log.logDate).slice(0, 10);
    const createdAtIso = /^\d{4}-\d{2}-\d{2}$/.test(logDateYmd)
      ? `${logDateYmd}T12:00:00.000Z`
      : new Date(log.logDate).toISOString();
    payload.push({
      jobId,
      authorUserId,
      note,
      clientVisible: !!log.viewableBy?.owner,
      subVisible: !!log.viewableBy?.subs,
      createdAt: createdAtIso,
      logDate: logDateYmd,
      ...(weather ? { weather } : {}),
      _btId: log.dailyLogId,
      _jobName: log.jobsiteName,
    });
  }

  const uniqueUnmapped = [...new Set(skippedUnmapped)];
  console.log(
    JSON.stringify(
      {
        sourceRows: logs.length,
        mapped: payload.length,
        unmappedJobsites: uniqueUnmapped,
      },
      null,
      2,
    ),
  );

  if (args["dry-run"] === "true") {
    console.log("dry-run sample", payload.slice(0, 2));
    return;
  }

  const totals = { success: 0, already_exists: 0, error: 0 };
  const errors: Array<{ index: number; btId: number; job: string; error: string }> = [];
  const batchSize = 50;

  for (let offset = 0; offset < payload.length; offset += batchSize) {
    const batch = payload.slice(offset, offset + batchSize);
    const body = {
      dailyLogs: batch.map(({ _btId: _a, _jobName: _b, ...rest }) => rest),
    };
    const res = await fetch(`${apiBase}/api/v1/migration/daily-logs`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    let json: {
      data?: Array<{ index: number; status: string; error?: string; dailyLogId?: string }>;
      error?: string;
      message?: string;
    };
    try {
      json = JSON.parse(text);
    } catch {
      console.error("non-json", res.status, text.slice(0, 300));
      process.exit(1);
    }
    if (!res.ok) {
      console.error("batch failed", res.status, json);
      process.exit(1);
    }
    for (const row of json.data ?? []) {
      const status = row.status as keyof typeof totals;
      if (status in totals) totals[status] += 1;
      if (row.status === "error") {
        const src = batch[row.index];
        errors.push({
          index: offset + row.index,
          btId: src?._btId ?? -1,
          job: src?._jobName ?? "?",
          error: row.error ?? "unknown",
        });
      }
    }
    console.log(
      `batch ${offset}-${offset + batch.length - 1} ok; running`,
      totals,
      `errors so far ${errors.length}`,
    );
  }

  console.log(JSON.stringify({ totals, errorCount: errors.length, errors: errors.slice(0, 30) }, null, 2));
  fs.writeFileSync(
    "/tmp/daily-log-import-result.json",
    JSON.stringify({ totals, errors, mapped: payload.length }, null, 2),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
