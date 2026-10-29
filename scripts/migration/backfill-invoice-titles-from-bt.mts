/**
 * Backfill Invoice.title from Buildertrend Invoices.csv for OPEN jobs.
 *
 * Matches BT ID# to WCI invoiceNumber suffix (handles J054-INV-0001, JOB_EE4D-7,
 * 932-1, 0001, etc.). Never invents amounts or payments — titles only.
 *
 *   DATABASE_URL=… npx tsx scripts/migration/backfill-invoice-titles-from-bt.mts \
 *     --invoices docs/bt-exports/Invoices.csv [--dry-run]
 */
import "dotenv/config";
import { createReadStream } from "fs";
import { createInterface } from "readline";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client";

function parseArgs(argv: string[]) {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (!t.startsWith("--")) continue;
    const k = t.slice(2);
    const n = argv[i + 1];
    if (!n || n.startsWith("--")) out[k] = "true";
    else {
      out[k] = n;
      i++;
    }
  }
  return out;
}

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') inQuotes = false;
      else cur += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") {
      cells.push(cur);
      cur = "";
    } else cur += ch;
  }
  cells.push(cur);
  return cells;
}

async function readCsv(path: string): Promise<Record<string, string>[]> {
  const rl = createInterface({ input: createReadStream(path, { encoding: "utf8" }) });
  let headers: string[] | null = null;
  const rows: Record<string, string>[] = [];
  for await (const line of rl) {
    const trimmed = line.replace(/^\uFEFF/, "");
    if (!trimmed) continue;
    const cells = parseCsvLine(trimmed);
    if (!headers) {
      headers = cells.map((h) => h.trim());
      continue;
    }
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = (cells[i] ?? "").trim();
    });
    rows.push(row);
  }
  return rows;
}

/** Normalize BT/WCI invoice id tokens to bare numeric id for matching. */
function invoiceIdKey(raw: string): string {
  // Strip " Draw N" suffixes so "JOB_755B-0134 Draw 4" → id 134, not 4.
  const s = String(raw).trim().replace(/\s+Draw\s+\d+\s*$/i, "");
  const inv = s.match(/INV-0*(\d+)/i);
  if (inv) return String(parseInt(inv[1], 10));
  const dash = s.match(/-0*(\d+)\s*$/);
  if (dash) return String(parseInt(dash[1], 10));
  const bare = s.match(/^0*(\d+)$/);
  if (bare) return String(parseInt(bare[1], 10));
  // "0129 - Title…" style Newcomb numbers
  const lead = s.match(/^0*(\d+)\b/);
  if (lead) return String(parseInt(lead[1], 10));
  return s.replace(/^0+/, "") || "0";
}

function dollarsToCents(raw: string): number {
  const n = Number(String(raw).replace(/[$,]/g, ""));
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL required");
  process.exit(1);
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const invoicesPath = args.invoices;
  if (!invoicesPath) {
    console.error("Usage: --invoices <Invoices.csv> [--dry-run]");
    process.exit(1);
  }
  const dryRun = args["dry-run"] === "true";

  const btRows = await readCsv(invoicesPath);
  const org = await prisma.organization.findFirst({ where: { slug: "world-construction" } });
  if (!org) throw new Error("no org");
  const jobs = await prisma.job.findMany({
    where: { organizationId: org.id, status: "OPEN" },
    select: { id: true, name: true },
  });
  const jobByName = new Map(jobs.map((j) => [j.name.trim(), j]));

  let updated = 0;
  let skipped = 0;
  let unmatched = 0;

  for (const row of btRows) {
    const jobName = (row.Job || "").trim();
    const title = (row.Title || "").trim();
    const idRaw = row["ID#"] || row.ID || "";
    if (!jobName || !title || !idRaw) {
      skipped++;
      continue;
    }
    const job = jobByName.get(jobName) || [...jobByName.entries()].find(([n]) => n === jobName.replace(/\s+$/, ""))?.[1];
    if (!job) {
      // trailing-space job names in CSV
      const soft = [...jobByName.entries()].find(([n]) => n.toLowerCase() === jobName.toLowerCase());
      if (!soft) {
        unmatched++;
        continue;
      }
    }
    const j =
      jobByName.get(jobName) ||
      [...jobByName.entries()].find(([n]) => n.toLowerCase() === jobName.toLowerCase())?.[1];
    if (!j) {
      unmatched++;
      continue;
    }

    const key = invoiceIdKey(idRaw);
    const amountCents = dollarsToCents(row["Total Price"] || "0");
    const invoices = await prisma.invoice.findMany({
      where: { jobId: j.id, status: { not: "VOID" } },
      select: { id: true, invoiceNumber: true, title: true, amountCents: true },
    });
    const candidates = invoices.filter((inv) => invoiceIdKey(inv.invoiceNumber) === key);
    // Prefer amount match when duplicate suffixes exist
    const match =
      candidates.find((c) => c.amountCents === amountCents) ||
      (candidates.length === 1 ? candidates[0] : null);
    if (!match) {
      unmatched++;
      continue;
    }
    if (match.title === title) {
      skipped++;
      continue;
    }
    if (dryRun) {
      console.log(`DRY ${j.name} ${match.invoiceNumber}: ${JSON.stringify(match.title)} → ${JSON.stringify(title)}`);
      updated++;
      continue;
    }
    await prisma.invoice.update({ where: { id: match.id }, data: { title } });
    console.log(`ok ${j.name} ${match.invoiceNumber} → ${title}`);
    updated++;
  }

  console.log(JSON.stringify({ updated, skipped, unmatched, dryRun }, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
