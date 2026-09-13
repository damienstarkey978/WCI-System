/**
 * Marks the 30 CostCode rows in BUILDERTREND_INACTIVE_COST_CODES (src/lib/cost-
 * codes/diagnostics.ts) inactive — each one confirmed by hand against World
 * Construction's live Buildertrend Cost Codes settings (Inactive filter on) to be a
 * Buildertrend code that's already retired there, not a live data-quality problem.
 * Matched by id, re-checked against the expected name before writing, so this can
 * never touch anything beyond what was actually verified.
 *
 * Same logic (archiveKnownBuildertrendInactiveCostCodes) also runs from the app
 * itself if a diagnostics-page button is added later; this script exists so it can
 * be run today without waiting on that.
 */
import { db } from "@/lib/db";
import { archiveKnownBuildertrendInactiveCostCodes } from "@/lib/cost-codes/diagnostics";

const DRY_RUN = process.argv.includes("--dry-run");

const org = await db.organization.findFirst({ select: { id: true } });
if (!org) {
  console.error("No organization found.");
  process.exit(1);
}

const result = await archiveKnownBuildertrendInactiveCostCodes(org.id, { dryRun: DRY_RUN });

console.log(`${DRY_RUN ? "[--dry-run, nothing will be written] " : ""}${result.archivedCount} row(s) marked inactive, ${result.alreadyInactiveCount} already inactive.`);
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
