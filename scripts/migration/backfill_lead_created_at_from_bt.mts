/**
 * Backfill Lead.createdAt from Damien's BT Leads export "Created Date".
 * Does not invent dates — only updates leads that match a BT title with a
 * parseable Created Date. Leaves unmatched prod leads untouched.
 *
 *   DATABASE_URL=… npx tsx scripts/migration/backfill_lead_created_at_from_bt.mts
 *   DATABASE_URL=… npx tsx scripts/migration/backfill_lead_created_at_from_bt.mts --dry-run
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client";
import { normalizeLeadKey } from "../../src/lib/crm/import";

const ORG = "0a3188e6-e257-49bb-994c-f5d15618608a";
const STORE = "/cursor/stores/self/docs/bt-exports";
const CSV = join(STORE, "Leads_Damien_2026-10-31.csv");
const DRY = process.argv.includes("--dry-run");

function parseCsv(text: string): Array<Record<string, string>> {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = parseCsvLine(lines[0]!);
  const rows: Array<Record<string, string>> = [];
  let i = 1;
  while (i < lines.length) {
    let chunk = lines[i]!;
    while ((chunk.match(/"/g) ?? []).length % 2 === 1 && i + 1 < lines.length) {
      i += 1;
      chunk += "\n" + lines[i];
    }
    if (!chunk.trim()) {
      i += 1;
      continue;
    }
    const cols = parseCsvLine(chunk);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = cols[idx] ?? "";
    });
    rows.push(row);
    i += 1;
  }
  return rows;
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (inQ) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else if (ch === '"') {
        inQ = false;
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQ = true;
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function parseBtCreated(raw: string): Date | null {
  const c = (raw ?? "").trim();
  if (!c) return null;
  const d = new Date(c);
  return Number.isNaN(d.getTime()) ? null : d;
}

function sameInstant(a: Date, b: Date): boolean {
  return a.getTime() === b.getTime();
}

async function main() {
  if (!existsSync(CSV)) throw new Error(`Missing ${CSV}`);
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL required");

  const db = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });

  const btRows = parseCsv(readFileSync(CSV, "utf8"));
  const byTitle = new Map<string, Date>();
  let btRowsWithDate = 0;
  let btBadDate = 0;
  for (const row of btRows) {
    const title = (row.Title ?? "").trim();
    if (!title) continue;
    const created = parseBtCreated(row["Created Date"] ?? "");
    if (!created) {
      btBadDate += 1;
      continue;
    }
    btRowsWithDate += 1;
    // First wins if duplicate titles (shouldn't happen in Damien export)
    if (!byTitle.has(title)) byTitle.set(title, created);
  }

  const leads = await db.lead.findMany({
    where: { organizationId: ORG },
    select: {
      id: true,
      title: true,
      name: true,
      email: true,
      addressLine1: true,
      createdAt: true,
    },
  });

  const summary = {
    dryRun: DRY,
    source: CSV,
    btRows: btRows.length,
    btRowsWithDate,
    btBadDate,
    prodLeads: leads.length,
    matched: 0,
    updated: 0,
    alreadyCorrect: 0,
    unmatchedProd: 0,
    samples: [] as Array<{
      title: string | null;
      before: string;
      after: string;
      id: string;
    }>,
    robinHood: null as null | {
      id: string;
      title: string | null;
      before: string;
      after: string;
      updated: boolean;
    },
  };

  for (const lead of leads) {
    const title = (lead.title ?? "").trim();
    const btDate = title ? byTitle.get(title) : undefined;
    if (!btDate) {
      summary.unmatchedProd += 1;
      continue;
    }
    summary.matched += 1;
    if (sameInstant(lead.createdAt, btDate)) {
      summary.alreadyCorrect += 1;
      if (title === "4212 Robin Hood Rd.-Dan Cook-Garage Remodel") {
        summary.robinHood = {
          id: lead.id,
          title: lead.title,
          before: lead.createdAt.toISOString(),
          after: btDate.toISOString(),
          updated: false,
        };
      }
      continue;
    }

    if (summary.samples.length < 12) {
      summary.samples.push({
        title: lead.title,
        before: lead.createdAt.toISOString(),
        after: btDate.toISOString(),
        id: lead.id,
      });
    }
    if (title === "4212 Robin Hood Rd.-Dan Cook-Garage Remodel") {
      summary.robinHood = {
        id: lead.id,
        title: lead.title,
        before: lead.createdAt.toISOString(),
        after: btDate.toISOString(),
        updated: !DRY,
      };
    }

    if (!DRY) {
      await db.lead.update({
        where: { id: lead.id },
        data: { createdAt: btDate },
      });
    }
    summary.updated += 1;
  }

  // Distinct createdAt days before/after snapshot
  const afterLeads = await db.lead.findMany({
    where: { organizationId: ORG },
    select: { createdAt: true, title: true },
  });
  const dayCounts = new Map<string, number>();
  for (const l of afterLeads) {
    const day = l.createdAt.toISOString().slice(0, 10);
    dayCounts.set(day, (dayCounts.get(day) ?? 0) + 1);
  }
  const topDays = [...dayCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15);

  const report = {
    ...summary,
    distinctCreatedDays: dayCounts.size,
    topCreatedDays: topDays,
  };
  console.log(JSON.stringify(report, null, 2));
  writeFileSync("/tmp/lead-createdAt-backfill.json", JSON.stringify(report, null, 2));
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
