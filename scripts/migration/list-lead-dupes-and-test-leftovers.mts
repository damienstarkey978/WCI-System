/**
 * Read-only inventory for Damien (Heather 1pm #5 dupes + #14 leftovers).
 * Does NOT delete anything.
 *
 *   DATABASE_URL=… npx tsx scripts/migration/list-lead-dupes-and-test-leftovers.mts
 */

import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../../src/generated/prisma/client";

function norm(s: string | null | undefined): string {
  return (s ?? "").toLowerCase().replace(/\s+/g, " ").trim();
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  try {
    const leads = await db.lead.findMany({
      select: {
        id: true,
        title: true,
        name: true,
        email: true,
        addressLine1: true,
        stage: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    const byTitle = new Map<string, typeof leads>();
    const byNameAddr = new Map<string, typeof leads>();
    for (const lead of leads) {
      const tKey = norm(lead.title ?? lead.name);
      const aKey = `${norm(lead.name)}|${norm(lead.addressLine1)}`;
      if (!byTitle.has(tKey)) byTitle.set(tKey, []);
      byTitle.get(tKey)!.push(lead);
      if (!byNameAddr.has(aKey)) byNameAddr.set(aKey, []);
      byNameAddr.get(aKey)!.push(lead);
    }

    const titleDupes = [...byTitle.entries()]
      .filter(([, rows]) => rows.length > 1)
      .map(([key, rows]) => ({ key, count: rows.length, ids: rows.map((r) => r.id), names: rows.map((r) => r.title ?? r.name) }));
    const addrDupes = [...byNameAddr.entries()]
      .filter(([key, rows]) => rows.length > 1 && !key.endsWith("|"))
      .map(([key, rows]) => ({ key, count: rows.length, ids: rows.map((r) => r.id) }));

    const smokeLogs = await db.dailyLog.findMany({
      where: {
        OR: [
          { note: { contains: "smoke", mode: "insensitive" } },
          { note: { contains: "PROBE", mode: "insensitive" } },
          { title: { contains: "smoke", mode: "insensitive" } },
          { note: { contains: "test", mode: "insensitive" } },
        ],
        createdAt: { gte: new Date("2026-10-30T00:00:00.000Z") },
      },
      select: { id: true, jobId: true, title: true, note: true, createdAt: true },
      take: 50,
    });

    const probeBills = await db.bill.findMany({
      where: {
        OR: [
          { billNumber: { startsWith: "PROBE" } },
          { title: { contains: "PROBE", mode: "insensitive" } },
          { billNumber: { startsWith: "MIGTEST" } },
        ],
      },
      select: { id: true, jobId: true, billNumber: true, title: true, approvalStatus: true, createdAt: true },
      take: 50,
    });

    const testTodos = await db.todo.findMany({
      where: {
        OR: [
          { title: { contains: "smoke", mode: "insensitive" } },
          { title: { startsWith: "TEST" } },
          { title: { contains: "PROBE", mode: "insensitive" } },
        ],
      },
      select: { id: true, jobId: true, title: true, status: true, createdAt: true },
      take: 50,
    });

    const testInvoices = await db.invoice.findMany({
      where: {
        OR: [
          { invoiceNumber: { startsWith: "MIGTESTINV" } },
          { invoiceNumber: { startsWith: "TEST-INV" } },
          { invoiceNumber: { startsWith: "TAXTEST" } },
        ],
      },
      select: { id: true, jobId: true, invoiceNumber: true, status: true, createdAt: true },
      take: 50,
    });

    const testBids = await db.bidPackage.findMany({
      where: {
        OR: [{ title: { contains: "TEST-BID" } }, { title: { startsWith: "TEST" } }],
      },
      select: { id: true, jobId: true, title: true, status: true, createdAt: true },
      take: 50,
    });

    console.log(
      JSON.stringify(
        {
          leadsTotal: leads.length,
          titleDupes: { groups: titleDupes.length, sample: titleDupes.slice(0, 15) },
          nameAddressDupes: { groups: addrDupes.length, sample: addrDupes.slice(0, 15) },
          testLeftovers: {
            smokeDailyLogs: smokeLogs,
            probeBills,
            testTodos,
            testInvoices,
            testBids,
          },
          note: "No deletes performed. Ask Damien before purging any of the above.",
        },
        null,
        2,
      ),
    );
  } finally {
    await db.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
