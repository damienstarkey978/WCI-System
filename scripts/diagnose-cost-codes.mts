/**
 * Read-only. Reports what an org's CostCode catalog actually looks like on
 * production, against the canonical list in prisma/seed.ts.
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
 * script's output is what tells you whether you need.
 */
import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

const org = await prisma.organization.findFirst({ select: { id: true, name: true, slug: true } });
if (!org) {
  console.error("No organization found.");
  process.exit(1);
}
console.log(`Organization: ${org.name} (${org.slug})\n`);

const costCodes = await prisma.costCode.findMany({
  where: { organizationId: org.id },
  select: { id: true, code: true, name: true, parentId: true, isActive: true },
  orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
});

console.log(`Total cost codes: ${costCodes.length}\n`);

const codeEqualsName = costCodes.filter((c) => c.code.trim().toLowerCase() === c.name.trim().toLowerCase());
const blankCode = costCodes.filter((c) => c.code.trim().length === 0);
const codesLookCanonical = costCodes.filter((c) => /^[A-Z0-9]+(-[A-Z0-9-]+)*$/.test(c.code) && c.code !== c.name);

console.log(`code === name (case-insensitive):  ${codeEqualsName.length}`);
console.log(`code is blank:                     ${blankCode.length}`);
console.log(`code looks like seed.ts's scheme:  ${codesLookCanonical.length}`);

console.log("\n--- first 20 rows, verbatim ---");
for (const c of costCodes.slice(0, 20)) {
  console.log(`  code=${JSON.stringify(c.code)}  name=${JSON.stringify(c.name)}  active=${c.isActive}  parentId=${c.parentId ?? "null"}`);
}

if (codeEqualsName.length > 0) {
  console.log(`\n--- all ${codeEqualsName.length} row(s) where code === name ---`);
  for (const c of codeEqualsName) {
    console.log(`  id=${c.id}  code=${JSON.stringify(c.code)}  name=${JSON.stringify(c.name)}`);
  }
}

console.log(
  "\nIf 'code === name' or 'code is blank' accounts for most/all rows, that confirms the theory — " +
    "run fix-cost-code-codes.mts next, which repairs codes in place without touching any row's id " +
    "(so every Estimate/PO/Bill/Budget line already pointing at these rows is unaffected).",
);

await prisma.$disconnect();
