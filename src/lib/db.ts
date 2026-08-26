import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@/generated/prisma/client";
import { databaseUrl, isProduction } from "@/lib/env";

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
 * Next.js dev-mode hot reload re-evaluates modules, so the instance is cached on
 * globalThis to avoid exhausting database connections.
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

  if (!isProduction) {
    globalForPrisma.prisma = client;
  }
  return client;
}

export const db: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, property, receiver) {
    const client = getClient();
    const value = Reflect.get(client, property, receiver);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
