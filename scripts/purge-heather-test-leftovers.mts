/**
 * Purge Heather's Oct 28 test leftovers + repair job-style client names.
 *
 *   npx tsx scripts/purge-heather-test-leftovers.mts [--dry-run]
 *
 * Default applies. Pass --dry-run to preview only. Same logic also runs from
 * /admin/diagnostics behind an explicit confirm.
 */
import { applyHeatherTestPurge, previewHeatherTestPurge } from "@/lib/admin/heather-test-purge";
import { db } from "@/lib/db";

const dryRun = process.argv.includes("--dry-run");

const org = await db.organization.findFirst({ where: { slug: "world-construction" }, select: { id: true, name: true } });
if (!org) {
  console.error('Organization slug "world-construction" not found.');
  process.exit(1);
}
console.log(`Org: ${org.name} (${org.id})`);

if (dryRun) {
  const preview = await previewHeatherTestPurge(org.id);
  console.log(JSON.stringify(preview, null, 2));
  console.log("\n--dry-run set — nothing changed.");
  await db.$disconnect();
  process.exit(0);
}

const result = await applyHeatherTestPurge(org.id);
console.log(
  JSON.stringify(
    {
      deletedVendors: result.deletedVendors,
      deletedInvoices: result.deletedInvoices,
      deletedDailyLogs: result.deletedDailyLogs,
      deletedProposals: result.deletedProposals,
      deletedInboundEmails: result.deletedInboundEmails,
      repairedClientNames: result.repairedClientNames,
      skipped: result.skipped,
    },
    null,
    2,
  ),
);

await db.$disconnect();
