/**
 * Read-only. Reports what an org's CostCode catalog actually looks like on
 * production, against the canonical list in src/lib/cost-codes/canonical.ts.
 *
 * The complaint: cost-code pickers across the app render `{code.code} — {code.name}`
 * — checked in every one of them, that template is correct everywhere — but in
 * production "the only thing visible is the title." The one way that's true even
 * though the template is right: `code` and `name` are the same string (or `code` is
 * blank) on the actual rows, so "CODE — NAME" reads as "Labor — Labor" or " — Labor"
 * and looks like a single field.
 *
 * That would happen if these rows were created by something other than
 * prisma/seed.ts — its canonical list gives every leaf a real derived code like
 * "05-INT-PAINT-LABOR". The migration import (src/lib/migration/service.ts) never
 * creates a CostCode itself — every imported line item requires an existing
 * costCodeId and throws UnknownCostCodeError otherwise — so whatever's live now was
 * seeded before that import ran, by seed.ts or by something else.
 *
 * This only reports. See fix-cost-code-codes.mts for the actual repair, which this
 * script's output is what tells you whether you need. Same logic is also available
 * from the app itself at /admin/diagnostics, for whenever a terminal isn't handy.
 */
import { db } from "@/lib/db";
import { diagnoseCostCodes } from "@/lib/cost-codes/diagnostics";

const org = await db.organization.findFirst({ select: { id: true } });
if (!org) {
  console.error("No organization found.");
  process.exit(1);
}

const report = await diagnoseCostCodes(org.id);

console.log(`Organization: ${report.organizationName}\n`);
console.log(`Total cost codes: ${report.totalCount}\n`);
console.log(`code === name (case-insensitive):  ${report.codeEqualsNameCount}`);
console.log(`code is blank:                     ${report.blankCodeCount}`);
console.log(`code looks like the canonical scheme:  ${report.canonicalLookingCount}`);

console.log("\n--- first 20 rows, verbatim ---");
for (const c of report.sampleRows) {
  console.log(`  code=${JSON.stringify(c.code)}  name=${JSON.stringify(c.name)}  active=${c.active}  parentId=${c.parentId ?? "null"}`);
}

if (report.codeEqualsNameRows.length > 0) {
  console.log(`\n--- all ${report.codeEqualsNameRows.length} row(s) where code === name ---`);
  for (const c of report.codeEqualsNameRows) {
    console.log(`  id=${c.id}  code=${JSON.stringify(c.code)}  name=${JSON.stringify(c.name)}`);
  }
}

console.log(
  "\nIf 'code === name' or 'code is blank' accounts for most/all rows, that confirms the theory — " +
    "run fix-cost-code-codes.mts next, which repairs codes in place without touching any row's id " +
    "(so every Estimate/PO/Bill/Budget line already pointing at these rows is unaffected).",
);

await db.$disconnect();
