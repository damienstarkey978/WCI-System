/**
 * Read-only diagnosis and in-place repair of a CostCode catalog's `code`/`parentId`
 * values, shared by scripts/diagnose-cost-codes.mts, scripts/fix-cost-code-codes.mts,
 * and the in-app admin diagnostics page (src/app/admin/diagnostics) — one
 * implementation instead of three copies that can drift.
 *
 * See CANONICAL_COST_CODES (src/lib/cost-codes/canonical.ts) for why this repairs
 * existing rows by name match rather than re-seeding: every already-imported
 * Estimate/PO/Bill/Budget line points at a CostCode by id, and re-seeding would
 * create new, correctly-coded rows alongside the old ones instead of fixing them.
 */
import { CANONICAL_COST_CODES } from "@/lib/cost-codes/canonical";
import { db } from "@/lib/db";

export interface CostCodeDiagnosis {
  readonly organizationName: string;
  readonly totalCount: number;
  readonly codeEqualsNameCount: number;
  readonly blankCodeCount: number;
  readonly canonicalLookingCount: number;
  readonly codeEqualsNameRows: readonly { id: string; code: string; name: string }[];
  readonly sampleRows: readonly { code: string; name: string; active: boolean; parentId: string | null }[];
  readonly looksBad: boolean;
}

/**
 * A handful of canonical entries — EXTERIOR/Exterior, FINANCIAL/Financial,
 * INTERIOR/Interior — are top-level categories whose code intentionally equals their
 * name; that's correct, not a data problem. Confirmed against production
 * (2026-09-13): without this exclusion the "code === name" count includes these
 * alongside genuinely miscoded rows (TRIM, HVAC), which sent Cowork chasing two rows
 * that were never broken.
 */
const CANONICAL_CODE_EQUALS_NAME_LOWER = new Set(
  CANONICAL_COST_CODES.filter((entry) => entry.code.trim().toLowerCase() === entry.name.trim().toLowerCase()).map((entry) =>
    entry.name.trim().toLowerCase(),
  ),
);

export async function diagnoseCostCodes(organizationId: string): Promise<CostCodeDiagnosis> {
  const org = await db.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { name: true } });

  const costCodes = await db.costCode.findMany({
    where: { organizationId },
    select: { id: true, code: true, name: true, parentId: true, isActive: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });

  const codeEqualsNameRows = costCodes.filter(
    (c) => c.code.trim().toLowerCase() === c.name.trim().toLowerCase() && !CANONICAL_CODE_EQUALS_NAME_LOWER.has(c.name.trim().toLowerCase()),
  );
  const blankCode = costCodes.filter((c) => c.code.trim().length === 0);
  const canonicalLooking = costCodes.filter((c) => /^[A-Z0-9]+(-[A-Z0-9-]+)*$/.test(c.code) && c.code !== c.name);

  return {
    organizationName: org.name,
    totalCount: costCodes.length,
    codeEqualsNameCount: codeEqualsNameRows.length,
    blankCodeCount: blankCode.length,
    canonicalLookingCount: canonicalLooking.length,
    codeEqualsNameRows: codeEqualsNameRows.map((c) => ({ id: c.id, code: c.code, name: c.name })),
    sampleRows: costCodes.slice(0, 20).map((c) => ({ code: c.code, name: c.name, active: c.isActive, parentId: c.parentId })),
    looksBad: codeEqualsNameRows.length + blankCode.length > 0,
  };
}

export interface CostCodeFixResult {
  readonly organizationName: string;
  readonly fixedCount: number;
  readonly parentsFixedCount: number;
  readonly alreadyCorrectCount: number;
  readonly notFoundNames: readonly string[];
  /** Canonical entries with no live match that were created this run — only ever
   *  populated when `createMissing` is set; see fixCostCodes' own doc comment. */
  readonly createdNames: readonly string[];
  readonly unmatchedLiveRows: readonly { id: string; code: string; name: string }[];
  readonly fixedDetail: readonly string[];
  readonly dryRun: boolean;
}

/**
 * `createMissing` creates a live row for a canonical entry with no live match at all,
 * instead of only reporting it — deliberately opt-in (default false, matching every
 * other write in this file) because "no live row" and "a live row exists under an
 * unexpected name" look identical from this function's own name-matching alone, and
 * only a human (or, here, Cowork's own cross-check against the real Buildertrend
 * cost-code settings and QuickBooks catalog, 2026-09-13) can tell them apart safely —
 * see canonical.ts's own comment on the same date for which canonical names were
 * confirmed genuinely absent versus renamed to match Buildertrend's live data.
 */
export async function fixCostCodes(organizationId: string, options: { dryRun: boolean; createMissing?: boolean }): Promise<CostCodeFixResult> {
  const org = await db.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { name: true } });

  const liveRows = await db.costCode.findMany({
    where: { organizationId },
    select: { id: true, code: true, name: true, defaultCostType: true, parentId: true },
  });

  const liveByName = new Map(liveRows.map((row) => [row.name.trim().toLowerCase(), row]));
  const canonicalByCode = new Map(CANONICAL_COST_CODES.map((entry) => [entry.code, entry]));

  const idByCanonicalCode = new Map<string, string>();
  let fixed = 0;
  let alreadyCorrect = 0;
  const notFound: string[] = [];
  const created: string[] = [];
  const fixedDetail: string[] = [];

  for (const entry of CANONICAL_COST_CODES) {
    const live = liveByName.get(entry.name.trim().toLowerCase());
    if (!live) {
      if (options.createMissing) {
        fixedDetail.push(`"${entry.name}" — created new row (code ${JSON.stringify(entry.code)})`);
        if (!options.dryRun) {
          const newRow = await db.costCode.create({
            data: { organizationId, code: entry.code, name: entry.name, defaultCostType: entry.defaultCostType, isActive: true },
          });
          idByCanonicalCode.set(entry.code, newRow.id);
        }
        created.push(entry.name);
      } else {
        notFound.push(entry.name);
      }
      continue;
    }
    idByCanonicalCode.set(entry.code, live.id);

    if (live.code === entry.code && live.defaultCostType === entry.defaultCostType) {
      alreadyCorrect += 1;
      continue;
    }

    fixedDetail.push(`"${entry.name}" — code ${JSON.stringify(live.code)} -> ${JSON.stringify(entry.code)}`);
    if (!options.dryRun) {
      await db.costCode.update({ where: { id: live.id }, data: { code: entry.code, defaultCostType: entry.defaultCostType } });
    }
    fixed += 1;
  }

  let parentsFixed = 0;
  for (const entry of CANONICAL_COST_CODES) {
    if (!entry.parent) continue;
    const rowId = idByCanonicalCode.get(entry.code);
    const parentId = idByCanonicalCode.get(entry.parent);
    if (!rowId || !parentId) continue;

    const live = liveRows.find((row) => row.id === rowId);
    if (live?.parentId === parentId) continue;

    fixedDetail.push(`parent: "${entry.name}" -> "${canonicalByCode.get(entry.parent)?.name}"`);
    if (!options.dryRun) {
      await db.costCode.update({ where: { id: rowId }, data: { parentId } });
    }
    parentsFixed += 1;
  }

  const matchedNames = new Set(CANONICAL_COST_CODES.map((entry) => entry.name.trim().toLowerCase()));
  const unmatchedLive = liveRows.filter((row) => !matchedNames.has(row.name.trim().toLowerCase()));

  return {
    organizationName: org.name,
    fixedCount: fixed,
    parentsFixedCount: parentsFixed,
    alreadyCorrectCount: alreadyCorrect,
    notFoundNames: notFound,
    createdNames: created,
    unmatchedLiveRows: unmatchedLive.map((row) => ({ id: row.id, code: row.code, name: row.name })),
    fixedDetail,
    dryRun: options.dryRun,
  };
}

/**
 * 30 live CostCode rows confirmed (2026-09-13, Cowork cross-check against World
 * Construction's live Buildertrend Cost Codes settings with the Inactive filter on)
 * to each match a cost code Buildertrend itself already has marked Inactive — several
 * split into multiple rows during the CSV migration (e.g. Buildertrend's one inactive
 * "Baseboard, Casing, Sills, Crown" became 4 separate MIG-* rows here). Not a data
 * problem, just retired Buildertrend codes that came along in the import — hardcoded
 * by id (not a name search) so this can only ever touch rows verified by hand, and
 * the `expectedName` is checked again at run time before writing, so a ProdCode
 * whose name changed since this list was compiled is skipped rather than silently
 * archived.
 */
export const BUILDERTREND_INACTIVE_COST_CODES: readonly { readonly id: string; readonly expectedName: string }[] = [
  { id: "cmtw7p73e000m09jm6ksb28ly", expectedName: "Room Remodel" },
  { id: "cmtw7p743000209juypsajhsn", expectedName: "Mirror" },
  { id: "cmtw7p172000a09jmapku29ey", expectedName: "Accesories" },
  { id: "cmtw7p76x000309junujc49ye", expectedName: "Vanity" },
  { id: "cmtw7p79p000409juhl4mx9m1", expectedName: "Toilet" },
  { id: "6a95b06e-396b-4e07-848a-dd9b9919a89e", expectedName: "Concrete/ Foundation Materials:" },
  { id: "06723dda-7d8c-4360-8936-e1f6fd80003c", expectedName: "Exterior Painting" },
  { id: "cf794d3f-2a09-440b-a2da-9ca882a468be", expectedName: "Interior Painting" },
  { id: "c9af504c-d446-425e-81d8-04167a8af79e", expectedName: "Ext Doors" },
  { id: "971de56e-5302-4284-8b4c-9d3447535fe9", expectedName: "Windows" },
  { id: "b29ac179-68ec-4d8b-bbaf-e3add2bac29c", expectedName: "Batt Insulation" },
  { id: "6a9c8275-dc31-4448-b8b0-6b5087d34830", expectedName: "Interior Doors, hinges and handles" },
  { id: "cmtw7p7c4000509juz9vju7ms", expectedName: "hinges and handles" },
  { id: "8187b93f-c9f9-4b1e-ae53-ee37b6b49d17", expectedName: "Tile and Grout" },
  { id: "ae9c046f-1525-4342-a4aa-f6e111c2e36b", expectedName: "Plumbing L&M" },
  { id: "7aa69914-b623-4728-8e28-27012ac10730", expectedName: "Electrical L&M" },
  { id: "33d27e53-d642-41db-99d1-f2bbae91231d", expectedName: "Mechanical L&M" },
  { id: "60530140-71f0-44fc-89c1-a92440f4ad69", expectedName: "Kitchen (General)" },
  { id: "c61c7b1c-c89d-483f-af4d-b7dc40fcf50a", expectedName: "LVP, Hardwood, Laminate" },
  { id: "cmtw7p65i000i09jmiyxiy2fm", expectedName: "Hardwood" },
  { id: "cmtw7p6e5000109ju525ews84", expectedName: "LVP" },
  { id: "cmtw7p7c1000o09jmpl1nio9s", expectedName: "Laminate" },
  { id: "03d68b6e-e5aa-4fce-8767-4d431c3efc8a", expectedName: "Baseboard, Casing, Sills, Crown" },
  { id: "cmtw7p1be000c09jmn5klt66b", expectedName: "Baseboard" },
  { id: "cmtw7p1ej000f09jmn7eiuiu2", expectedName: "Casing" },
  { id: "cmtw7p1fs000h09jm56sdxhjd", expectedName: "Crown" },
  { id: "cmtw7pb0r000009ifzmv6a7kh", expectedName: "Sills" },
  { id: "5b70238c-12e6-4046-bae3-d4343b8145d0", expectedName: "Framing L&M" },
  { id: "0176858b-e499-4d2a-a8fc-b788893a98f4", expectedName: "Structural Repairs" },
  { id: "bcfa0084-dbbe-4dfe-a541-a26f1c7ef780", expectedName: "Bathroom (General)" },
];

export interface ArchiveInactiveCostCodesResult {
  readonly archivedCount: number;
  readonly alreadyInactiveCount: number;
  /** id existed in this org but its current name no longer matches what was verified
   *  — skipped rather than archived, so a since-repurposed row is never touched. */
  readonly mismatchedIds: readonly string[];
  /** id from the list wasn't found for this org at all (wrong org, already deleted). */
  readonly missingIds: readonly string[];
  readonly dryRun: boolean;
}

export async function archiveKnownBuildertrendInactiveCostCodes(
  organizationId: string,
  options: { dryRun: boolean },
): Promise<ArchiveInactiveCostCodesResult> {
  const ids = BUILDERTREND_INACTIVE_COST_CODES.map((entry) => entry.id);
  const liveRows = await db.costCode.findMany({
    where: { id: { in: ids }, organizationId },
    select: { id: true, name: true, isActive: true },
  });
  const liveById = new Map(liveRows.map((row) => [row.id, row]));

  let archived = 0;
  let alreadyInactive = 0;
  const mismatched: string[] = [];
  const missing: string[] = [];

  for (const entry of BUILDERTREND_INACTIVE_COST_CODES) {
    const live = liveById.get(entry.id);
    if (!live) {
      missing.push(entry.id);
      continue;
    }
    if (live.name.trim().toLowerCase() !== entry.expectedName.trim().toLowerCase()) {
      mismatched.push(entry.id);
      continue;
    }
    if (!live.isActive) {
      alreadyInactive += 1;
      continue;
    }
    if (!options.dryRun) {
      await db.costCode.update({ where: { id: entry.id }, data: { isActive: false } });
    }
    archived += 1;
  }

  return { archivedCount: archived, alreadyInactiveCount: alreadyInactive, mismatchedIds: mismatched, missingIds: missing, dryRun: options.dryRun };
}
