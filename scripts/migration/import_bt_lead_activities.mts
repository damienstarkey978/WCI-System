import { readFileSync, writeFileSync } from "node:fs";
import { PrismaPg } from "@prisma/adapter-pg";
import { LeadActivityType } from "../../src/generated/prisma/enums";
import { PrismaClient } from "../../src/generated/prisma/client";
import { createLeadActivity } from "../../src/lib/crm/service";

const ORG = "0a3188e6-e257-49bb-994c-f5d15618608a";
const DAMIEN = "9f121a70-9250-479e-891e-a6b813057416";

function mapType(raw: string): LeadActivityType {
  const t = (raw ?? "").toLowerCase();
  if (t.includes("call") || t.includes("phone")) return LeadActivityType.CALL;
  if (t.includes("email") || t.includes("mail")) return LeadActivityType.EMAIL;
  if (t.includes("meet") || t.includes("visit") || t.includes("appoint")) return LeadActivityType.MEETING;
  if (t.includes("task") || t.includes("follow") || t.includes("review") || t.includes("confirm")) return LeadActivityType.TASK;
  return LeadActivityType.NOTE;
}
function normTitle(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

async function main() {
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
  const rows = JSON.parse(readFileSync("/tmp/lead-activities.json", "utf8")) as Array<Record<string, string>>;
  const leads = await db.lead.findMany({
    where: { organizationId: ORG },
    select: { id: true, title: true, name: true },
  });
  const byTitle = new Map<string, string>();
  for (const l of leads) byTitle.set(normTitle(l.title ?? l.name), l.id);

  let created = 0, skippedNoLead = 0, skippedDup = 0;
  const unmatched: string[] = [];
  for (const row of rows) {
    const opp = (row["Opportunity Title"] ?? "").trim();
    if (!opp) continue;
    const leadId = byTitle.get(normTitle(opp));
    if (!leadId) { skippedNoLead += 1; unmatched.push(opp); continue; }
    const type = mapType(row.Type ?? "NOTE");
    const note = [
      row.Type ? `[BT type: ${row.Type}]` : null,
      row.Status ? `[BT status: ${row.Status}]` : null,
      row["Assigned User"] ? `[Assigned: ${row["Assigned User"]}]` : null,
      row["Activity Notes"]?.trim() || null,
    ].filter(Boolean).join(" ") || "[Imported from Buildertrend activity]";

    const exists = await db.leadActivity.findFirst({
      where: { organizationId: ORG, leadId, note },
      select: { id: true },
    });
    if (exists) { skippedDup += 1; continue; }
    await createLeadActivity({ organizationId: ORG, leadId, type, note, createdByUserId: DAMIEN });
    created += 1;
  }
  const total = await db.leadActivity.count({ where: { organizationId: ORG } });
  const report = { rowsRead: rows.length, created, skippedNoLead, skippedDup, unmatched, totalActivities: total };
  console.log(JSON.stringify(report, null, 2));
  writeFileSync("/tmp/lead-activities-import.json", JSON.stringify(report, null, 2));
  await db.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
