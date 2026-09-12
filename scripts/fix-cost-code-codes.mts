/**
 * Repairs a CostCode catalog's `code` and `parentId` values in place, matched by
 * `name`, without touching any row's `id`.
 *
 * Run diagnose-cost-codes.mts first — this is the fix it points at once that
 * confirms bad codes are live. The reason this updates existing rows instead of
 * re-running prisma/seed.ts's upsert: seed.ts matches on `(organizationId, code)`,
 * so if the live rows carry a different code than the canonical one (e.g. code ===
 * name), upserting would create 63 brand-new, correctly-coded rows alongside the
 * old ones rather than fixing them — and every already-imported Estimate/PO/Bill/
 * Budget line still points at the old row's id by foreign key. Fixing the existing
 * rows in place is what keeps every one of those 8,212 imported lines pointed at a
 * cost code that now has a real code, with nothing to re-link.
 *
 * Every name in CANONICAL is unique (checked against prisma/seed.ts — 87 names, 87
 * unique), so matching on name has no ambiguity to worry about.
 */
import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client";
import { CostType } from "../src/generated/prisma/enums";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const DRY_RUN = process.argv.includes("--dry-run");

interface CanonicalEntry {
  code: string;
  name: string;
  defaultCostType: CostType;
  parent?: string;
}

// Identical to prisma/seed.ts's COST_CODES — kept as a separate literal here rather
// than imported, since seed.ts is a script entry point, not a module other scripts
// import from. If seed.ts's list changes, update this to match before running.
const CANONICAL: readonly CanonicalEntry[] = [
  { code: "01", name: "Pre Construction", defaultCostType: CostType.NONE },
  { code: "02", name: "Concrete/ Foundations", defaultCostType: CostType.NONE },
  { code: "03", name: "Siding/ Soffit", defaultCostType: CostType.NONE },
  { code: "04", name: "Roofing", defaultCostType: CostType.NONE },
  { code: "05", name: "Painting", defaultCostType: CostType.NONE },
  { code: "06", name: "Ext Doors and Windows", defaultCostType: CostType.NONE },
  { code: "07", name: "Insulation", defaultCostType: CostType.NONE },
  { code: "08", name: "Drywall", defaultCostType: CostType.NONE },
  { code: "09", name: "Interior Doors", defaultCostType: CostType.NONE },
  { code: "10", name: "Tile", defaultCostType: CostType.NONE },
  { code: "11", name: "Plumbing", defaultCostType: CostType.NONE },
  { code: "12", name: "Electrical", defaultCostType: CostType.NONE },
  { code: "13", name: "Mechanical", defaultCostType: CostType.NONE },
  { code: "14", name: "Bathroom Fixtures", defaultCostType: CostType.NONE },
  { code: "15", name: "Kitchen", defaultCostType: CostType.NONE },
  { code: "16", name: "Flooring", defaultCostType: CostType.NONE },
  { code: "17", name: "Trim Carpentry", defaultCostType: CostType.NONE },
  { code: "18", name: "Waste Removal", defaultCostType: CostType.NONE },
  { code: "19", name: "Framing", defaultCostType: CostType.NONE },
  { code: "BUILDERTREND-DEFAULT", name: "Buildertrend Default", defaultCostType: CostType.NONE },
  { code: "EXTERIOR", name: "Exterior", defaultCostType: CostType.NONE },
  { code: "FINANCIAL", name: "Financial", defaultCostType: CostType.NONE },
  { code: "INTERIOR", name: "Interior", defaultCostType: CostType.NONE },
  { code: "01-ARCHITECTURAL-PLANS", name: "Architectural Plans", defaultCostType: CostType.OTHER, parent: "01" },
  { code: "01-COMMISSION", name: "Commission", defaultCostType: CostType.OTHER, parent: "01" },
  { code: "01-DESIGN-SERVICES", name: "Design Services", defaultCostType: CostType.OTHER, parent: "01" },
  { code: "01-LABOR", name: "Labor", defaultCostType: CostType.LABOR, parent: "01" },
  { code: "01-SALES-TAX", name: "Sales Tax", defaultCostType: CostType.OTHER, parent: "01" },
  { code: "01-STRUCTURAL-PLANS", name: "Structural Plans", defaultCostType: CostType.OTHER, parent: "01" },
  { code: "02-CONCRETE-FOUNDATION-LABOR", name: "Concrete/ Foundation Labor", defaultCostType: CostType.LABOR, parent: "02" },
  { code: "02-CONCRETE-FOUNDATIONS-MATERIALS", name: "Concrete/ Foundations Materials", defaultCostType: CostType.MATERIAL, parent: "02" },
  { code: "03-SIDING-LABOR", name: "Siding Labor", defaultCostType: CostType.LABOR, parent: "03" },
  { code: "03-SIDING-MATERIALS", name: "Siding Materials", defaultCostType: CostType.MATERIAL, parent: "03" },
  { code: "03-SOFFIT-LABOR", name: "Soffit Labor", defaultCostType: CostType.LABOR, parent: "03" },
  { code: "03-SOFFIT-MATERIALS", name: "Soffit Materials", defaultCostType: CostType.MATERIAL, parent: "03" },
  { code: "04-ROOFING-LABOR", name: "Roofing Labor", defaultCostType: CostType.LABOR, parent: "04" },
  { code: "04-ROOFING-MATERIALS", name: "Roofing Materials", defaultCostType: CostType.MATERIAL, parent: "04" },
  { code: "05-EXT-PAINTING-LABOR", name: "Ext Painting Labor", defaultCostType: CostType.LABOR, parent: "05" },
  { code: "05-EXT-PAINTING-MATERIALS", name: "Ext Painting Materials", defaultCostType: CostType.MATERIAL, parent: "05" },
  { code: "05-INT-PAINT-LABOR", name: "Int Paint Labor", defaultCostType: CostType.LABOR, parent: "05" },
  { code: "05-INT-PAINT-MATERIALS", name: "Int Paint Materials", defaultCostType: CostType.MATERIAL, parent: "05" },
  { code: "06-EXT-DOORS-LABOR", name: "Ext Doors Labor", defaultCostType: CostType.LABOR, parent: "06" },
  { code: "06-EXT-DOORS-MATERIAL", name: "Ext Doors Material", defaultCostType: CostType.MATERIAL, parent: "06" },
  { code: "06-WINDOWS-LABOR", name: "Windows Labor", defaultCostType: CostType.LABOR, parent: "06" },
  { code: "06-WINDOWS-MATERIALS", name: "Windows Materials", defaultCostType: CostType.MATERIAL, parent: "06" },
  { code: "07-INSULATION-LABOR", name: "Insulation Labor", defaultCostType: CostType.LABOR, parent: "07" },
  { code: "07-INSULATION-MATERIALS", name: "Insulation Materials", defaultCostType: CostType.MATERIAL, parent: "07" },
  { code: "08-DRYWALL-LABOR", name: "Drywall Labor", defaultCostType: CostType.LABOR, parent: "08" },
  { code: "08-DRYWALL-MATERIALS", name: "Drywall Materials", defaultCostType: CostType.MATERIAL, parent: "08" },
  { code: "09-INT-DOORS-LABOR", name: "Int Doors Labor", defaultCostType: CostType.LABOR, parent: "09" },
  { code: "09-INT-DOORS-MATERIALS", name: "Int Doors Materials", defaultCostType: CostType.MATERIAL, parent: "09" },
  { code: "10-TILE-LABOR", name: "Tile Labor", defaultCostType: CostType.LABOR, parent: "10" },
  { code: "10-TILE-MATERIALS", name: "Tile Materials", defaultCostType: CostType.MATERIAL, parent: "10" },
  { code: "11-PLUMBING-LABOR", name: "Plumbing Labor", defaultCostType: CostType.LABOR, parent: "11" },
  { code: "11-PLUMBING-MATERIALS", name: "Plumbing Materials", defaultCostType: CostType.MATERIAL, parent: "11" },
  { code: "12-ELECTRICAL-LABOR", name: "Electrical Labor", defaultCostType: CostType.LABOR, parent: "12" },
  { code: "12-ELECTRICAL-MATERIALS", name: "Electrical Materials", defaultCostType: CostType.MATERIAL, parent: "12" },
  { code: "13-MECHANICAL-LABOR", name: "Mechanical Labor", defaultCostType: CostType.LABOR, parent: "13" },
  { code: "13-MECHANICAL-MATERIALS", name: "Mechanical Materials", defaultCostType: CostType.MATERIAL, parent: "13" },
  { code: "14-BATHROOM-LABOR", name: "Bathroom Labor", defaultCostType: CostType.LABOR, parent: "14" },
  { code: "14-BATHROOM-MATERIALS", name: "Bathroom Materials", defaultCostType: CostType.MATERIAL, parent: "14" },
  { code: "15-CABINETS", name: "Cabinets", defaultCostType: CostType.OTHER, parent: "15" },
  { code: "15-COUNTERS", name: "Counters", defaultCostType: CostType.OTHER, parent: "15" },
  { code: "15-KITCHEN-LABOR", name: "Kitchen Labor", defaultCostType: CostType.LABOR, parent: "15" },
  { code: "15-KITCHEN-MATERIALS", name: "Kitchen Materials", defaultCostType: CostType.MATERIAL, parent: "15" },
  { code: "16-CARPET-LABOR", name: "Carpet Labor", defaultCostType: CostType.LABOR, parent: "16" },
  { code: "16-CARPET-MATERIAL", name: "Carpet Material", defaultCostType: CostType.MATERIAL, parent: "16" },
  { code: "16-LVP-FLOORING-LABOR", name: "LVP Flooring Labor", defaultCostType: CostType.LABOR, parent: "16" },
  { code: "16-LVP-FLOORING-MATERIALS", name: "LVP Flooring Materials", defaultCostType: CostType.MATERIAL, parent: "16" },
  { code: "17-FINISH-CARPENTRY-LABOR", name: "Finish Carpentry Labor", defaultCostType: CostType.LABOR, parent: "17" },
  { code: "17-FINISH-CARPENTRY-MATERIALS", name: "Finish Carpentry Materials", defaultCostType: CostType.MATERIAL, parent: "17" },
  { code: "18-DEMO-LABOR", name: "Demo Labor", defaultCostType: CostType.LABOR, parent: "18" },
  { code: "18-DUMPSTER-LABOR", name: "Dumpster Labor", defaultCostType: CostType.LABOR, parent: "18" },
  { code: "19-ADDITION", name: "Addition", defaultCostType: CostType.OTHER, parent: "19" },
  { code: "19-FRAMING-LABOR", name: "Framing Labor", defaultCostType: CostType.LABOR, parent: "19" },
  { code: "19-FRAMING-MATERIALS", name: "Framing Materials", defaultCostType: CostType.MATERIAL, parent: "19" },
  {
    code: "BUILDERTREND-DEFAULT-BUILDERTREND-FLAT-RATE",
    name: "Buildertrend Flat Rate",
    defaultCostType: CostType.OTHER,
    parent: "BUILDERTREND-DEFAULT",
  },
  { code: "EXTERIOR-EXTERIOR-REPAIRS-LABOR", name: "Exterior Repairs Labor", defaultCostType: CostType.LABOR, parent: "EXTERIOR" },
  { code: "EXTERIOR-EXTERIOR-REPAIRS-MATERIAL", name: "Exterior Repairs Material", defaultCostType: CostType.MATERIAL, parent: "EXTERIOR" },
  { code: "EXTERIOR-FENCING-LABOR", name: "Fencing Labor", defaultCostType: CostType.LABOR, parent: "EXTERIOR" },
  { code: "EXTERIOR-GUTTERS-LABOR", name: "Gutters Labor", defaultCostType: CostType.LABOR, parent: "EXTERIOR" },
  { code: "FINANCIAL-BONUS", name: "Bonus", defaultCostType: CostType.OTHER, parent: "FINANCIAL" },
  { code: "FINANCIAL-CREDIT", name: "Credit", defaultCostType: CostType.OTHER, parent: "FINANCIAL" },
  { code: "FINANCIAL-CUSTOMER-PAYMENT", name: "Customer Payment", defaultCostType: CostType.OTHER, parent: "FINANCIAL" },
  { code: "INTERIOR-CLEANING-LABOR", name: "Cleaning Labor", defaultCostType: CostType.LABOR, parent: "INTERIOR" },
  { code: "INTERIOR-CLEANING-MATERIAL", name: "Cleaning Material", defaultCostType: CostType.MATERIAL, parent: "INTERIOR" },
];

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

const org = await prisma.organization.findFirst({ select: { id: true, name: true } });
if (!org) {
  console.error("No organization found.");
  process.exit(1);
}
console.log(`Organization: ${org.name}${DRY_RUN ? " (--dry-run, nothing will be written)" : ""}\n`);

const liveRows = await prisma.costCode.findMany({
  where: { organizationId: org.id },
  select: { id: true, code: true, name: true, defaultCostType: true, parentId: true },
});

const liveByName = new Map(liveRows.map((row) => [row.name.trim().toLowerCase(), row]));
const canonicalByCode = new Map(CANONICAL.map((entry) => [entry.code, entry]));

// Pass 1: fix code + defaultCostType on every row whose name matches a canonical
// entry. Collects the new id-by-canonical-code map from the *existing* row ids, so
// pass 2 can wire up parentId without creating anything.
const idByCanonicalCode = new Map<string, string>();
let fixed = 0;
let alreadyCorrect = 0;
const notFound: string[] = [];

for (const entry of CANONICAL) {
  const live = liveByName.get(entry.name.trim().toLowerCase());
  if (!live) {
    notFound.push(entry.name);
    continue;
  }
  idByCanonicalCode.set(entry.code, live.id);

  if (live.code === entry.code && live.defaultCostType === entry.defaultCostType) {
    alreadyCorrect += 1;
    continue;
  }

  console.log(`  fix: "${entry.name}" — code ${JSON.stringify(live.code)} -> ${JSON.stringify(entry.code)}`);
  if (!DRY_RUN) {
    await prisma.costCode.update({
      where: { id: live.id },
      data: { code: entry.code, defaultCostType: entry.defaultCostType },
    });
  }
  fixed += 1;
}

// Pass 2: parentId, now that every row above has its correct code and every
// canonical code maps to a real existing row id.
let parentsFixed = 0;
for (const entry of CANONICAL) {
  if (!entry.parent) continue;
  const rowId = idByCanonicalCode.get(entry.code);
  const parentId = idByCanonicalCode.get(entry.parent);
  if (!rowId || !parentId) continue;

  const live = liveRows.find((row) => row.id === rowId);
  if (live?.parentId === parentId) continue;

  console.log(`  parent: "${entry.name}" -> "${canonicalByCode.get(entry.parent)?.name}"`);
  if (!DRY_RUN) {
    await prisma.costCode.update({ where: { id: rowId }, data: { parentId } });
  }
  parentsFixed += 1;
}

const matchedNames = new Set(CANONICAL.map((entry) => entry.name.trim().toLowerCase()));
const unmatchedLive = liveRows.filter((row) => !matchedNames.has(row.name.trim().toLowerCase()));

console.log(`\n${fixed} code/type fix(es), ${parentsFixed} parent link(s), ${alreadyCorrect} already correct.`);
if (notFound.length > 0) {
  console.log(`\n${notFound.length} canonical name(s) with no matching live row — these need creating by hand:`);
  for (const name of notFound) console.log(`  - ${name}`);
}
if (unmatchedLive.length > 0) {
  console.log(`\n${unmatchedLive.length} live row(s) not in the canonical list — left untouched, review by hand:`);
  for (const row of unmatchedLive) console.log(`  - code=${JSON.stringify(row.code)} name=${JSON.stringify(row.name)} (id ${row.id})`);
}
if (DRY_RUN) console.log("\nNothing was written — re-run without --dry-run to apply.");

await prisma.$disconnect();
