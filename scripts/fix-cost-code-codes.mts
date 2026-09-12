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
 * Same logic (src/lib/cost-codes/diagnostics.ts's fixCostCodes) also runs from the
 * app itself at /admin/diagnostics, behind an explicit confirm, for whenever a
 * terminal isn't handy.
 */
import { db } from "@/lib/db";
import { fixCostCodes } from "@/lib/cost-codes/diagnostics";

const DRY_RUN = process.argv.includes("--dry-run");

const org = await db.organization.findFirst({ select: { id: true } });
if (!org) {
  console.error("No organization found.");
  process.exit(1);
}

const result = await fixCostCodes(org.id, { dryRun: DRY_RUN });

console.log(`Organization: ${result.organizationName}${DRY_RUN ? " (--dry-run, nothing will be written)" : ""}\n`);
for (const line of result.fixedDetail) console.log(`  ${line}`);

console.log(`\n${result.fixedCount} code/type fix(es), ${result.parentsFixedCount} parent link(s), ${result.alreadyCorrectCount} already correct.`);
if (result.notFoundNames.length > 0) {
  console.log(`\n${result.notFoundNames.length} canonical name(s) with no matching live row — these need creating by hand:`);
  for (const name of result.notFoundNames) console.log(`  - ${name}`);
}
if (result.unmatchedLiveRows.length > 0) {
  console.log(`\n${result.unmatchedLiveRows.length} live row(s) not in the canonical list — left untouched, review by hand:`);
  for (const row of result.unmatchedLiveRows) console.log(`  - code=${JSON.stringify(row.code)} name=${JSON.stringify(row.name)} (id ${row.id})`);
}
if (DRY_RUN) console.log("\nNothing was written — re-run without --dry-run to apply.");

await db.$disconnect();
