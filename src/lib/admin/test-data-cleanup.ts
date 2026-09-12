/**
 * One-off cleanup helper for test records left behind by QA on production — kept
 * generic (find/delete by email) rather than named for the one incident it was
 * built for, since this is the kind of thing that recurs.
 */
import { db } from "@/lib/db";

export interface TestRecordPreview {
  readonly leads: readonly { id: string; name: string; email: string | null }[];
  readonly clients: readonly { id: string; name: string; email: string | null }[];
}

export async function findTestRecordsByEmail(email: string): Promise<TestRecordPreview> {
  const [leads, clients] = await Promise.all([
    db.lead.findMany({ where: { email }, select: { id: true, name: true, email: true } }),
    db.client.findMany({ where: { email }, select: { id: true, name: true, email: true } }),
  ]);
  return { leads, clients };
}

export async function deleteTestRecordsByEmail(email: string): Promise<{ deletedLeads: number; deletedClients: number }> {
  const { leads, clients } = await findTestRecordsByEmail(email);
  for (const lead of leads) await db.lead.delete({ where: { id: lead.id } });
  for (const client of clients) await db.client.delete({ where: { id: client.id } });
  return { deletedLeads: leads.length, deletedClients: clients.length };
}
