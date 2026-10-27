/**
 * One-shot Buildertrend Subs + Client Contacts import for the World Construction org.
 *
 *   DATABASE_URL=... npx tsx scripts/import-bt-contacts.mts \
 *     --subs /path/to/Subs-import.csv \
 *     --clients /path/to/ClientContacts-import.csv
 *
 * Optional: --org world-construction (default)
 *
 * Does not send invites, emails, or SMS. Safe to re-run (fill-blanks only).
 */

import "dotenv/config";

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client";
import { importClients, parseClientSheet } from "../src/lib/client-portal/import";
import { importVendors, parseVendorSheet } from "../src/lib/vendor-portal/import";

function parseArgs(argv: readonly string[]): Record<string, string> {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
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

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const args = parseArgs(process.argv.slice(2));
const orgSlug = args.org ?? "world-construction";
const subsPath = args.subs ? resolve(args.subs) : null;
const clientsPath = args.clients ? resolve(args.clients) : null;

if (!subsPath && !clientsPath) {
  console.error("Pass --subs and/or --clients with a CSV path.");
  process.exit(1);
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main() {
  const org = await prisma.organization.findFirst({ where: { slug: orgSlug }, select: { id: true, name: true, slug: true } });
  if (!org) {
    console.error(`Organization slug "${orgSlug}" not found.`);
    process.exit(1);
  }
  console.log(`Org: ${org.name} (${org.slug}) ${org.id}`);

  if (subsPath) {
    const rows = parseVendorSheet(readFileSync(subsPath, "utf8"));
    console.log(`Subs: parsed ${rows.length} rows from ${subsPath}`);
    const summary = await importVendors(org.id, rows);
    console.log(
      JSON.stringify(
        {
          vendors: {
            rowsRead: summary.rowsRead,
            created: summary.created,
            updated: summary.updated,
            unchanged: summary.unchanged,
            duplicateRowsMerged: summary.duplicateRowsMerged,
            emailsSkipped: summary.emailsSkipped.length,
            extraEmails: summary.extraEmails.length,
          },
        },
        null,
        2,
      ),
    );
  }

  if (clientsPath) {
    const rows = parseClientSheet(readFileSync(clientsPath, "utf8"));
    console.log(`Clients: parsed ${rows.length} rows from ${clientsPath}`);
    const summary = await importClients(org.id, rows);
    console.log(
      JSON.stringify(
        {
          clients: {
            rowsRead: summary.rowsRead,
            created: summary.created,
            updated: summary.updated,
            unchanged: summary.unchanged,
            duplicateRowsMerged: summary.duplicateRowsMerged,
            skippedNoEmail: summary.skippedNoEmail,
            emailsSkipped: summary.emailsSkipped.length,
            extraEmails: summary.extraEmails.length,
          },
        },
        null,
        2,
      ),
    );
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
