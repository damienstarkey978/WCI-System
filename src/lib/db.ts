import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@/generated/prisma/client";
import { databaseUrl } from "@/lib/env";

/**
 * A single PrismaClient per process, created lazily.
 *
 * Prisma 7 connects through a driver adapter rather than a datasource URL, so the
 * connection string is handed to PrismaPg here.
 *
 * Lazy matters: route modules and domain helpers import `db` at module scope, and
 * `next build` evaluates those modules while collecting page data. Constructing the
 * client eagerly would make the build (and unit tests of pure helpers) require a
 * DATABASE_URL that isn't needed until a query actually runs.
 *
 * The instance is cached on globalThis unconditionally — in every environment, not
 * only dev. `db` below is a Proxy that calls getClient() on every property access
 * (every single query), so a `!isProduction` guard here (an earlier version of this
 * file had one) doesn't just fail to help production — it means production never
 * caches at all: every query opens a brand-new PrismaClient and its own pg.Pool,
 * which leaks Postgres connections until the server hits max_connections under any
 * real load. Caching is correct in both dev (survives hot-reload) and production
 * (this is the only thing making the "one PrismaClient per process" doc comment
 * above actually true).
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function getClient(): PrismaClient {
  if (globalForPrisma.prisma) {
    return globalForPrisma.prisma;
  }

  const client = new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl() }),
    log: ["warn", "error"],
  });

  globalForPrisma.prisma = client;
  return client;
}

export const db: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, property, receiver) {
    const client = getClient();
    const value = Reflect.get(client, property, receiver);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
