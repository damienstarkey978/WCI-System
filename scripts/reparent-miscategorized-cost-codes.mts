/**
 * Reparents the 3 CostCode rows in KNOWN_MISCATEGORIZED_COST_CODES (src/lib/cost-
 * codes/diagnostics.ts) — TRIM, HVAC, and FLOOR-LVP — under the Buildertrend
 * category they plainly belong to (Trim Carpentry, Mechanical, Flooring), even
 * though none of the three has an exact item-level match in Buildertrend. Only
 * ever touches `parentId`, never `code`/`name`/`defaultCostType`, so no existing
 * Estimate/PO/Bill/Budget line's cost type changes.
 *
 * Run scripts/fix-cost-code-codes.mts first — the target categories are matched by
 * their post-rename canonical name (e.g. "17 Trim Carpentry"), so this needs
 * Bucket 1's renames already applied.
 */
import { db } from "@/lib/db";
import { reparentKnownMiscategorizedCostCodes } from "@/lib/cost-codes/diagnostics";

const DRY_RUN = process.argv.includes("--dry-run");

const org = await db.organization.findFirst({ select: { id: true } });
if (!org) {
  console.error("No organization found.");
  process.exit(1);
}

const result = await reparentKnownMiscategorizedCostCodes(org.id, { dryRun: DRY_RUN });

console.log(`${DRY_RUN ? "[--dry-run, nothing will be written] " : ""}${result.reparentedCount} row(s) reparented, ${result.alreadyCorrectCount} already correct.`);
if (result.parentNotFoundIds.length > 0) {
  console.log(`\n${result.parentNotFoundIds.length} id(s) skipped — target category not found live yet. Run fix-cost-code-codes.mts first:`);
  for (const id of result.parentNotFoundIds) console.log(`  - ${id}`);
}
if (result.mismatchedIds.length > 0) {
  console.log(`\n${result.mismatchedIds.length} id(s) skipped — current name no longer matches what was verified:`);
  for (const id of result.mismatchedIds) console.log(`  - ${id}`);
}
if (result.missingIds.length > 0) {
  console.log(`\n${result.missingIds.length} id(s) not found for this organization:`);
  for (const id of result.missingIds) console.log(`  - ${id}`);
}
if (DRY_RUN) console.log("\nNothing was written — re-run without --dry-run to apply.");

await db.$disconnect();
