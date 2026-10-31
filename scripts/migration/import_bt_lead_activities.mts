/**
 * Idempotent import of BT Lead Activities grid export into WCI LeadActivity.
 * Prefer a full unfiltered BT export — do not invent activities from Notes.
 *
 * Input (first existing wins):
 *   /tmp/lead-activities.json
 *   docs/bt-exports/LeadActivities_*.csv  (store path)
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { LeadActivityType } from "../../src/generated/prisma/enums";
import { PrismaClient } from "../../src/generated/prisma/client";
import { createLeadActivity } from "../../src/lib/crm/service";

const ORG = "0a3188e6-e257-49bb-994c-f5d15618608a";
const DAMIEN = "9f121a70-9250-479e-891e-a6b813057416";
const STORE = "/cursor/stores/self/docs/bt-exports";

function mapType(raw: string): LeadActivityType {
  const t = (raw ?? "").toLowerCase();
  if (t.includes("call") || t.includes("phone")) return LeadActivityType.CALL;
  if (t.includes("email") || t.includes("mail")) return LeadActivityType.EMAIL;
  if (t.includes("meet") || t.includes("visit") || t.includes("appoint")) return LeadActivityType.MEETING;
  if (t.includes("task") || t.includes("follow") || t.includes("review") || t.includes("confirm")) {
    return LeadActivityType.TASK;
  }
  return LeadActivityType.NOTE;
}

function normTitle(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

function parseCsv(text: string): Array<Record<string, string>> {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = parseCsvLine(lines[0]!);
  const rows: Array<Record<string, string>> = [];
  let i = 1;
  while (i < lines.length) {
    let chunk = lines[i]!;
    // join multiline quoted fields
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

/** BT Excel serial date (days since 1899-12-30) → Date, or ISO/parseable string. */
function parseOccurredAt(raw: string): Date | null {
  const s = (raw ?? "").trim();
  if (!s) return null;
  if (/^\d+(\.\d+)?$/.test(s)) {
    const n = Number(s);
    // Excel serial
    if (n > 20000 && n < 80000) {
      const ms = Date.UTC(1899, 11, 30) + Math.round(n * 86400000);
      return new Date(ms);
    }
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function loadRows(): { rows: Array<Record<string, string>>; source: string } {
  // Prefer a full store CSV (newest LeadActivities_full_* then any LeadActivities_*.csv),
  // then fall back to /tmp/lead-activities.json from ad-hoc converts.
  const files = readdirSync(STORE).filter((f) => /^LeadActivities_.*\.csv$/i.test(f));
  const preferred =
    files.filter((f) => /full/i.test(f)).sort().reverse()[0] ??
    files.sort().reverse()[0];
  if (preferred) {
    const path = join(STORE, preferred);
    return { rows: parseCsv(readFileSync(path, "utf8")), source: path };
  }
  if (existsSync("/tmp/lead-activities.json")) {
    return {
      rows: JSON.parse(readFileSync("/tmp/lead-activities.json", "utf8")) as Array<Record<string, string>>,
      source: "/tmp/lead-activities.json",
    };
  }
  throw new Error("No lead activities input found (expected LeadActivities_*.csv or /tmp/lead-activities.json)");
}

async function main() {
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
  const { rows, source } = loadRows();
  const leads = await db.lead.findMany({
    where: { organizationId: ORG },
    select: { id: true, title: true, name: true },
  });

  function findLeadId(opp: string): string | undefined {
    const key = normTitle(opp);
    const exact = leads.find((l) => normTitle(l.title ?? "") === key || normTitle(l.name) === key);
    if (exact) return exact.id;
    // fuzzy: first 3 significant tokens
    const parts = key.split(" ").filter((p) => p.length > 2);
    const fuzzy = leads.find((l) => {
      const t = normTitle(`${l.title ?? ""} ${l.name}`);
      return parts.slice(0, 3).every((p) => t.includes(p));
    });
    return fuzzy?.id;
  }

  let created = 0;
  let skippedNoLead = 0;
  let skippedDup = 0;
  const unmatched: string[] = [];

  for (const row of rows) {
    const opp = (row["Opportunity Title"] ?? row.Title ?? "").trim();
    if (!opp) continue;
    const leadId = findLeadId(opp);
    if (!leadId) {
      skippedNoLead += 1;
      unmatched.push(opp);
      continue;
    }
    const type = mapType(row.Type ?? "NOTE");
    const note = [
      row.Type ? `[BT type: ${row.Type}]` : null,
      row.Status ? `[BT status: ${row.Status}]` : null,
      row["Assigned User"] ? `[Assigned: ${row["Assigned User"]}]` : null,
      row["Activity Notes"]?.trim() || null,
    ]
      .filter(Boolean)
      .join(" ") || "[Imported from Buildertrend activity]";

    const occurredAt = parseOccurredAt(row["Contact Date"] ?? "") ?? undefined;

    const exists = await db.leadActivity.findFirst({
      where: { organizationId: ORG, leadId, note },
      select: { id: true },
    });
    if (exists) {
      skippedDup += 1;
      continue;
    }
    await createLeadActivity({
      organizationId: ORG,
      leadId,
      type,
      note,
      createdByUserId: DAMIEN,
      ...(occurredAt ? { occurredAt } : {}),
    });
    created += 1;
  }

  const total = await db.leadActivity.count({ where: { organizationId: ORG } });
  const report = {
    source,
    rowsRead: rows.length,
    created,
    skippedNoLead,
    skippedDup,
    unmatched: [...new Set(unmatched)],
    totalActivities: total,
  };
  console.log(JSON.stringify(report, null, 2));
  writeFileSync("/tmp/lead-activities-import.json", JSON.stringify(report, null, 2));
  await db.$disconnect();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
