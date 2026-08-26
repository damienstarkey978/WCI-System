/**
 * Seeds the WCI organization and its cost code catalog.
 *
 * Idempotent — safe to re-run. Cost codes are upserted by (organizationId, code) so
 * re-seeding after the real Buildertrend export lands will update names in place.
 *
 * ⚠️  The Electrical / HVAC / Drywall entries below are PLACEHOLDERS. CLAUDE.md
 * section 6: export the full cost code list from the live Buildertrend account and
 * replace them with the real taxonomy before this becomes the system of record.
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
  /** True when the exact name still needs confirming against Buildertrend. */
  placeholder?: boolean;
}

/**
 * Confirmed from the Buildertrend account (CLAUDE.md section 6). Group rows carry
 * CostType NONE and exist so the Estimate builder can group by cost-code hierarchy.
 */
const COST_CODES: readonly SeedCostCode[] = [
  { code: "PAINT", name: "Painting", defaultCostType: CostType.NONE },
  { code: "PAINT-INT-L", name: "Int Paint Labor", defaultCostType: CostType.LABOR, parent: "PAINT" },
  { code: "PAINT-INT-M", name: "Int Paint Materials", defaultCostType: CostType.MATERIAL, parent: "PAINT" },

  { code: "TRIM", name: "Trim", defaultCostType: CostType.NONE },
  { code: "TRIM-L", name: "Finish Carpentry Labor", defaultCostType: CostType.LABOR, parent: "TRIM" },
  { code: "TRIM-M", name: "Finish Carpentry Materials", defaultCostType: CostType.MATERIAL, parent: "TRIM" },

  { code: "FLOOR", name: "Flooring", defaultCostType: CostType.NONE },
  { code: "FLOOR-LVP", name: "LVP Flooring", defaultCostType: CostType.MATERIAL, parent: "FLOOR" },

  // Confirmed present in Buildertrend; exact code names still to be exported.
  { code: "ELEC", name: "Electrical", defaultCostType: CostType.SUBCONTRACTOR, placeholder: true },
  { code: "HVAC", name: "HVAC", defaultCostType: CostType.SUBCONTRACTOR, placeholder: true },
  { code: "DRY", name: "Drywall", defaultCostType: CostType.SUBCONTRACTOR, placeholder: true },
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

  const placeholders = COST_CODES.filter((entry) => entry.placeholder);
  console.log(`✓ ${COST_CODES.length} cost codes seeded`);
  if (placeholders.length > 0) {
    console.warn(
      `⚠️  ${placeholders.length} placeholder cost codes (${placeholders
        .map((entry) => entry.code)
        .join(", ")}) — replace with the real Buildertrend export before go-live.`,
    );
  }
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
