/**
 * Import Buildertrend approved-proposal Excel exports (ProposalReport.xls) into
 * WCI as Estimate + ACCEPTED Proposal + send-to-budget.
 *
 *   DATABASE_URL=… npx tsx scripts/migration/import_bt_proposals.mts \
 *     --dir /path/to/docs/bt-exports/proposals \
 *     --job-map /path/to/docs/bt-exports/bt-to-wci-job-map.json
 *
 * Each subfolder under --dir should contain ProposalReport.xls (BT export shape:
 * Category, Cost Code, Title, Quantity, Unit, Unit Cost, Cost Type, Markup,
 * Client Price, …). Idempotent via Estimate.aiPromptNotes = bt-proposal:{slug}.
 */

import { createRequire } from "module";
import { readFileSync, readdirSync, existsSync } from "fs";
import { join } from "path";

// xlsx is CJS; ESM namespace import drops readFile under some loaders.
const require = createRequire(import.meta.url);
const XLSX = require("xlsx") as typeof import("xlsx");

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client";
import type { CostType } from "../../src/generated/prisma/enums";
import { markupBasisPointsFromProposalRow } from "../../src/lib/migration/bt-proposal-markup";
import { importApprovedProposal } from "../../src/lib/migration/service";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

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

function mapCostType(raw: string): CostType | undefined {
  const t = raw.trim().toLowerCase();
  if (t === "labor") return "LABOR";
  if (t === "material" || t === "materials") return "MATERIAL";
  if (t === "equipment") return "EQUIPMENT";
  if (t === "subcontractor" || t === "sub") return "SUBCONTRACTOR";
  if (t === "other") return "OTHER";
  return undefined;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

type JobMapEntry = { btName: string; wciId: string | null; wciName?: string };

async function resolveClientId(jobId: string): Promise<string | null> {
  const access = await prisma.clientJobAccess.findFirst({
    where: { jobId },
    orderBy: { createdAt: "asc" },
    select: { clientId: true },
  });
  return access?.clientId ?? null;
}

function normalizeCostCodeName(name: string): string {
  // BT Excel sometimes prefixes truncated parent paths with "… " / "... ".
  return name.replace(/^[.…\s]+/, "").trim();
}

async function costCodeIdByName(organizationId: string, name: string): Promise<string | null> {
  const cleaned = normalizeCostCodeName(name);
  const exact = await prisma.costCode.findFirst({
    where: { organizationId, name: { equals: cleaned, mode: "insensitive" } },
    select: { id: true },
  });
  if (exact) return exact.id;
  // Prefer the shortest contains-match so "Structural Repairs" beats a longer sibling.
  const fuzzy = await prisma.costCode.findMany({
    where: { organizationId, name: { contains: cleaned, mode: "insensitive" } },
    select: { id: true, name: true },
  });
  if (fuzzy.length === 1) return fuzzy[0].id;
  if (fuzzy.length > 1) {
    fuzzy.sort((a, b) => a.name.length - b.name.length);
    return fuzzy[0].id;
  }
  // Reverse contains: catalog name contained in the BT cell (e.g. "... Structural Repairs").
  const reverse = await prisma.costCode.findMany({
    where: { organizationId },
    select: { id: true, name: true },
  });
  const hits = reverse.filter((c) => cleaned.toLowerCase().includes(c.name.toLowerCase()));
  if (hits.length === 0) return null;
  hits.sort((a, b) => b.name.length - a.name.length);
  return hits[0].id;
}

function readProposalXls(path: string) {
  const wb = XLSX.readFile(path);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  return rows;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dir = args.dir;
  const mapPath = args["job-map"];
  if (!dir || !mapPath) {
    console.error("Usage: --dir <proposals-dir> --job-map <bt-to-wci-job-map.json> [--dry-run]");
    process.exit(1);
  }
  const dryRun = args["dry-run"] === "true";

  const org = await prisma.organization.findFirst({ select: { id: true, name: true } });
  if (!org) {
    console.error("No organization found");
    process.exit(1);
  }

  const jobMap = JSON.parse(readFileSync(mapPath, "utf8")) as JobMapEntry[];
  const bySlug = new Map(jobMap.filter((e) => e.wciId).map((e) => [slugify(e.btName), e]));

  const folders = readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  let ok = 0;
  let skip = 0;
  let err = 0;

  for (const folder of folders) {
    const xls = join(dir, folder, "ProposalReport.xls");
    const xlsx = join(dir, folder, "ProposalReport.xlsx");
    const file = existsSync(xls) ? xls : existsSync(xlsx) ? xlsx : null;
    if (!file) {
      console.log(`SKIP ${folder}: no ProposalReport.xls`);
      skip++;
      continue;
    }

    const mapped = bySlug.get(folder) ?? jobMap.find((e) => slugify(e.btName) === folder);
    if (!mapped?.wciId) {
      console.log(`SKIP ${folder}: no WCI job mapping`);
      skip++;
      continue;
    }

    const clientId = await resolveClientId(mapped.wciId);
    if (!clientId) {
      console.log(`SKIP ${folder}: no ClientJobAccess on ${mapped.wciId}`);
      skip++;
      continue;
    }

    const rows = readProposalXls(file);
    const lineItems = [];
    const missingCodes: string[] = [];
    for (const row of rows) {
      const costCodeName = String(row["Cost Code"] ?? "").trim();
      const title = String(row["Title"] ?? "").trim();
      if (!costCodeName || !title) continue;
      const costCodeId = await costCodeIdByName(org.id, costCodeName);
      if (!costCodeId) {
        missingCodes.push(costCodeName);
        continue;
      }
      const qty = Number(row["Quantity"] || 0);
      const unitCost = Number(row["Unit Cost"] || row["Builder Cost"] || 0);
      lineItems.push({
        costCodeId,
        title,
        description: String(row["Description"] ?? "") || null,
        groupLabel: String(row["Category"] ?? "") || null,
        costType: mapCostType(String(row["Cost Type"] ?? "")),
        quantityMilli: Math.round(qty * 1000),
        unit: String(row["Unit"] ?? "") || null,
        unitCostCents: Math.round(unitCost * 100),
        // Prefer Client Price / honor Markup Type "$" — percent-only blew Candlebark.
        markupBasisPoints: markupBasisPointsFromProposalRow(row as Record<string, unknown>),
        internalNote: String(row["Internal Notes"] ?? "") || null,
      });
    }

    if (missingCodes.length) {
      console.log(`ERROR ${folder}: unknown cost codes: ${[...new Set(missingCodes)].join(", ")}`);
      err++;
      continue;
    }
    if (lineItems.length === 0) {
      console.log(`SKIP ${folder}: zero line items`);
      skip++;
      continue;
    }

    const title = `Proposal for ${mapped.btName}`;
    console.log(
      `${dryRun ? "DRY " : ""}${folder}: ${lineItems.length} lines → job ${mapped.wciId.slice(0, 12)}…`,
    );
    if (dryRun) {
      ok++;
      continue;
    }

    try {
      const result = await importApprovedProposal({
        organizationId: org.id,
        jobId: mapped.wciId,
        clientId,
        title,
        externalKey: folder,
        lineItems,
        clientSignatureName: "Migrated from Buildertrend (approved)",
        clientSignedAt: new Date(),
        sendToBudget: true,
      });
      console.log(
        `  ${result.created ? "created" : "exists"} estimate=${result.estimateId} proposal=${result.proposalId} budgetLines=${result.budgetLinesWritten}`,
      );
      ok++;
    } catch (e) {
      console.log(`ERROR ${folder}:`, e instanceof Error ? e.message : e);
      err++;
    }
  }

  console.log(`Done. ok=${ok} skip=${skip} err=${err}`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
