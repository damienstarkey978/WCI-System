/**
 * Seeds the WCI organization and its cost code catalog.
 *
 * Idempotent — safe to re-run. Cost codes are upserted by (organizationId, code) so
 * re-running this after another Buildertrend export updates names in place. Any
 * existing cost code whose code isn't in COST_CODES below gets removed — hard
 * deleted if nothing references it, deactivated (isActive: false) instead if
 * something does (an Estimate/Budget/PO/Bill/TimeClockEntry line item, etc. — every
 * costCodeId relation but one is onDelete: Restrict, so a real delete would just
 * fail there anyway).
 *
 * COST_CODES below is the real export from Buildertrend (BTCostCodes_20260829.xlsx,
 * "Costs" sheet — its "Variance" sheet is a different Buildertrend feature, budget-
 * variance reason codes, with no equivalent model in this schema yet, so it isn't
 * reflected here). Category rows (the numbered "01 Pre Construction" etc. groups)
 * carry CostType NONE and exist so the Estimate builder can group by cost-code
 * hierarchy; codes are derived from the export (numeric prefix or a slug of the
 * category/item name), since the export gives category + item names only, not a
 * separate short code.
 */

// Next.js loads .env automatically; a standalone tsx script does not.
import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client";
import { CostType } from "../src/generated/prisma/enums";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is not set. Copy .env.example to .env and set it.");
  process.exit(1);
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

const ORGANIZATION = {
  name: "World Construction Inc",
  slug: process.env.DEV_ORGANIZATION_SLUG ?? "world-construction",
};

interface SeedCostCode {
  code: string;
  name: string;
  defaultCostType: CostType;
  /** Parent group code, if this is a child of another entry in this list. */
  parent?: string;
}

const COST_CODES: readonly SeedCostCode[] = [
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

async function main(): Promise<void> {
  const organization = await prisma.organization.upsert({
    where: { slug: ORGANIZATION.slug },
    update: { name: ORGANIZATION.name },
    create: ORGANIZATION,
  });
  console.log(`✓ Organization ${organization.name} (${organization.slug})`);

  // Two passes so a child can reference a parent created in the same run.
  const idByCode = new Map<string, string>();

  for (const [index, entry] of COST_CODES.entries()) {
    const costCode = await prisma.costCode.upsert({
      where: { organizationId_code: { organizationId: organization.id, code: entry.code } },
      update: { name: entry.name, defaultCostType: entry.defaultCostType, sortOrder: index },
      create: {
        organizationId: organization.id,
        code: entry.code,
        name: entry.name,
        defaultCostType: entry.defaultCostType,
        sortOrder: index,
      },
    });
    idByCode.set(entry.code, costCode.id);
  }

  for (const entry of COST_CODES) {
    if (!entry.parent) continue;
    const parentId = idByCode.get(entry.parent);
    if (!parentId) continue;
    await prisma.costCode.update({
      where: { organizationId_code: { organizationId: organization.id, code: entry.code } },
      data: { parentId },
    });
  }

  console.log(`✓ ${COST_CODES.length} cost codes seeded`);

  // Remove anything left over from a prior export that isn't in COST_CODES anymore —
  // hard delete where nothing references it, deactivate where something does (every
  // costCodeId relation but one is onDelete: Restrict, so a real delete would fail
  // there anyway; deactivating still gets it out of new estimates/pickers).
  const currentCodes = new Set(COST_CODES.map((entry) => entry.code));
  const stale = await prisma.costCode.findMany({
    where: { organizationId: organization.id, code: { notIn: [...currentCodes] } },
  });

  let deleted = 0;
  let deactivated = 0;
  for (const costCode of stale) {
    try {
      await prisma.costCode.delete({ where: { id: costCode.id } });
      deleted++;
    } catch {
      await prisma.costCode.update({ where: { id: costCode.id }, data: { isActive: false } });
      deactivated++;
    }
  }
  if (deleted > 0) console.log(`✓ ${deleted} stale cost code(s) deleted`);
  if (deactivated > 0) console.log(`✓ ${deactivated} stale cost code(s) deactivated (still referenced elsewhere)`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error: unknown) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
