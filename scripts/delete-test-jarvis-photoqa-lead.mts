/**
 * One-off cleanup: Cowork's photo-attachment QA on the Jarvis hang fix created a
 * real Client + Lead in production ("TEST Jarvis PhotoQA", test-jarvis-photoqa@
 * example.com) — no proposal was created alongside it (Jarvis correctly refused to
 * fabricate scope from a blank test image). Scoped tightly to that exact
 * placeholder email so this can't touch anything else. Run with --dry-run first.
 *
 * Same logic (src/lib/admin/test-data-cleanup.ts) also runs from the app itself at
 * /admin/diagnostics, behind an explicit confirm, for whenever a terminal isn't
 * handy.
 */
import { db } from "@/lib/db";
import { deleteTestRecordsByEmail, findTestRecordsByEmail } from "@/lib/admin/test-data-cleanup";

const TEST_EMAIL = "test-jarvis-photoqa@example.com";
const dryRun = process.argv.includes("--dry-run");

const { leads, clients } = await findTestRecordsByEmail(TEST_EMAIL);

if (leads.length === 0 && clients.length === 0) {
  console.log(`Nothing found for ${TEST_EMAIL} — already cleaned up, or it was never created here.`);
  process.exit(0);
}

console.log(`Found ${leads.length} lead(s) and ${clients.length} client(s) for ${TEST_EMAIL}:`);
for (const lead of leads) console.log(`  Lead   ${lead.id} | ${lead.name} | ${lead.email}`);
for (const client of clients) console.log(`  Client ${client.id} | ${client.name} | ${client.email}`);

if (dryRun) {
  console.log("\n--dry-run set — nothing deleted.");
  process.exit(0);
}

const { deletedLeads, deletedClients } = await deleteTestRecordsByEmail(TEST_EMAIL);
console.log(`\nDeleted ${deletedLeads} lead(s) and ${deletedClients} client(s).`);

await db.$disconnect();
