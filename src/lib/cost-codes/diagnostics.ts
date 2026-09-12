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

export async function diagnoseCostCodes(organizationId: string): Promise<CostCodeDiagnosis> {
  const org = await db.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { name: true } });

  const costCodes = await db.costCode.findMany({
    where: { organizationId },
    select: { id: true, code: true, name: true, parentId: true, isActive: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });

  const codeEqualsNameRows = costCodes.filter((c) => c.code.trim().toLowerCase() === c.name.trim().toLowerCase());
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
  readonly unmatchedLiveRows: readonly { id: string; code: string; name: string }[];
  readonly fixedDetail: readonly string[];
  readonly dryRun: boolean;
}

export async function fixCostCodes(organizationId: string, options: { dryRun: boolean }): Promise<CostCodeFixResult> {
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
  const fixedDetail: string[] = [];

  for (const entry of CANONICAL_COST_CODES) {
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
    unmatchedLiveRows: unmatchedLive.map((row) => ({ id: row.id, code: row.code, name: row.name })),
    fixedDetail,
    dryRun: options.dryRun,
  };
}
