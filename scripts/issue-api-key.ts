/**
 * Issue an API key for an agent or integration.
 *
 *   npm run issue-api-key -- --name duke
 *   npm run issue-api-key -- --name jarvis --org world-construction
 *   npm run issue-api-key -- --name reporting-bot --scopes jobs:read,budgets:read
 *
 * The token is printed exactly once — only its SHA-256 is stored.
 */

// Next.js loads .env automatically; a standalone tsx script does not.
import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client";
import { AgentKind } from "../src/generated/prisma/enums";
import { generateApiKeyToken } from "../src/lib/api-auth";
import { AGENT_DEFAULT_SCOPES, isScope, type Scope } from "../src/lib/api-scopes";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is not set. Copy .env.example to .env and set it.");
  process.exit(1);
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

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

function resolveAgentKind(name: string): AgentKind | null {
  const upper = name.toUpperCase();
  return upper in AgentKind ? AgentKind[upper as keyof typeof AgentKind] : null;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const name = args.name?.trim().toLowerCase();

  if (!name) {
    console.error("Usage: npm run issue-api-key -- --name <consumer> [--org <slug>] [--scopes a,b] [--expires-in-days N]");
    process.exit(1);
  }

  const orgSlug = args.org ?? process.env.DEV_ORGANIZATION_SLUG ?? "world-construction";
  const organization = await prisma.organization.findUnique({ where: { slug: orgSlug } });
  if (!organization) {
    console.error(`No organization with slug "${orgSlug}". Run \`npm run db:seed\` first.`);
    process.exit(1);
  }

  let scopes: readonly Scope[];
  if (args.scopes) {
    const requested = args.scopes.split(",").map((scope) => scope.trim()).filter(Boolean);
    const invalid = requested.filter((scope) => scope !== "*" && !scope.endsWith(":*") && !isScope(scope));
    if (invalid.length > 0) {
      console.error(`Unknown scope(s): ${invalid.join(", ")}`);
      process.exit(1);
    }
    scopes = requested as Scope[];
  } else {
    const defaults = AGENT_DEFAULT_SCOPES[name];
    if (!defaults) {
      console.error(
        `No default scopes for "${name}". Pass --scopes explicitly, or use one of: ${Object.keys(
          AGENT_DEFAULT_SCOPES,
        ).join(", ")}`,
      );
      process.exit(1);
    }
    scopes = defaults;
  }

  const expiresInDays = args["expires-in-days"] ? Number(args["expires-in-days"]) : null;
  if (expiresInDays !== null && (!Number.isFinite(expiresInDays) || expiresInDays <= 0)) {
    console.error("--expires-in-days must be a positive number");
    process.exit(1);
  }

  const { token, tokenId, hashedSecret } = generateApiKeyToken();

  const apiKey = await prisma.apiKey.create({
    data: {
      organizationId: organization.id,
      name,
      agentKind: resolveAgentKind(name),
      tokenId,
      hashedSecret,
      scopes: [...scopes],
      expiresAt: expiresInDays === null ? null : new Date(Date.now() + expiresInDays * 86_400_000),
    },
  });

  console.log("");
  console.log(`  API key issued for "${apiKey.name}" in ${organization.name}`);
  console.log("");
  console.log(`  Token (shown once — store it now):`);
  console.log(`    ${token}`);
  console.log("");
  console.log(`  Token id: ${apiKey.tokenId}`);
  console.log(`  Scopes:   ${apiKey.scopes.join(", ")}`);
  console.log(`  Expires:  ${apiKey.expiresAt?.toISOString() ?? "never"}`);
  console.log("");
  console.log(`  Try it:`);
  console.log(`    curl -H "Authorization: Bearer ${token}" http://localhost:3000/api/v1/jobs`);
  console.log("");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error: unknown) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
