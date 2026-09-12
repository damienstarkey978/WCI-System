/**
 * One-off cleanup: Cowork's photo-attachment QA on the Jarvis hang fix created a
 * real Client + Lead in production ("TEST Jarvis PhotoQA", test-jarvis-photoqa@
 * example.com) — no proposal was created alongside it (Jarvis correctly refused to
 * fabricate scope from a blank test image). Scoped tightly to that exact
 * placeholder email so this can't touch anything else. Run with --dry-run first.
 */
import { db } from "@/lib/db";

const TEST_EMAIL = "test-jarvis-photoqa@example.com";
const dryRun = process.argv.includes("--dry-run");

const leads = await db.lead.findMany({ where: { email: TEST_EMAIL }, select: { id: true, name: true, email: true } });
const clients = await db.client.findMany({ where: { email: TEST_EMAIL }, select: { id: true, name: true, email: true } });

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

for (const lead of leads) await db.lead.delete({ where: { id: lead.id } });
for (const client of clients) await db.client.delete({ where: { id: client.id } });

console.log(`\nDeleted ${leads.length} lead(s) and ${clients.length} client(s).`);
