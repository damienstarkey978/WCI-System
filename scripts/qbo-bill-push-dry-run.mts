/**
 * Money rule 4 — dry-run QBO bill push. Lists would-create count + dollar total.
 * Never POSTs to QuickBooks. Safe while QBO_BILL_PUSH_ENABLED is unset.
 *
 *   DATABASE_URL=… npx tsx scripts/qbo-bill-push-dry-run.mts [--org world-construction] [--bill id1,id2]
 */

import "dotenv/config";

import { db } from "../src/lib/db";
import { previewBillQuickBooksPush } from "../src/lib/quickbooks/sync/bill-push-preview";

function parseArgs(argv: readonly string[]): Record<string, string> {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token?.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) {
      args[key] = "true";
    } else {
      args[key] = next;
      i += 1;
    }
  }
  return args;
}

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const args = parseArgs(process.argv.slice(2));
const orgSlug = args.org ?? "world-construction";
const billIds = args.bill ? args.bill.split(",").map((id) => id.trim()).filter(Boolean) : undefined;

async function main() {
  const org = await db.organization.findFirst({
    where: { OR: [{ slug: orgSlug }, { name: { contains: "World Construction", mode: "insensitive" } }] },
    select: { id: true, name: true, slug: true },
  });
  if (!org) {
    console.error(`No organization matching ${orgSlug}`);
    process.exit(1);
  }

  console.log(`Org ${org.name} (${org.id}) — DRY RUN only (no QBO creates)`);
  console.log(`QBO_BILL_PUSH_ENABLED=${process.env.QBO_BILL_PUSH_ENABLED ?? "(unset → paused)"}`);

  const preview = await previewBillQuickBooksPush(org.id, billIds);
  console.log(`\nWould CREATE: ${preview.wouldCreateCount} bills / $${(preview.wouldCreateCents / 100).toFixed(2)}`);
  console.log(`Would UPDATE: ${preview.wouldUpdateCount}`);
  console.log(`Would LINK:   ${preview.wouldLinkCount}`);
  console.log(`Refused:      ${preview.refusedCount}`);
  console.log("\nRows:");
  for (const row of preview.rows) {
    console.log(
      `  ${row.outcome.padEnd(22)} ${row.billNumber ?? "(no#)"} | ${row.vendorName} | $${(row.totalCents / 100).toFixed(2)} | ${row.billId}` +
        (row.message ? `\n    → ${row.message}` : ""),
    );
  }
  console.log("\nWaiting for Damien's approval before any live push. Do not set QBO_BILL_PUSH_ENABLED yet.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
