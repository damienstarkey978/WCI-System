/**
 * Idempotent upsert of Damien's full BT Leads.xls export into WCI prod.
 * Creates missing leads; for existing matches, fills blank fields + syncs stage.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { PrismaPg } from "@prisma/adapter-pg";
import { LeadStage } from "../../src/generated/prisma/enums.ts";
import { PrismaClient } from "../../src/generated/prisma/client.ts";
import { createLead } from "../../src/lib/crm/service.ts";
import { normalizeLeadKey } from "../../src/lib/crm/import.ts";
import {
  normalizePersonName,
  resolveLeadSalespersonUserId,
} from "../../src/lib/crm/salesperson.ts";
import { parseDollarsToCents } from "../../src/lib/money.ts";

const ORG = "0a3188e6-e257-49bb-994c-f5d15618608a";

type Row = {
  Title: string;
  "Client Contact": string;
  Email: string;
  Phone: string;
  Source: string;
  Status: string;
  "Project Type": string;
  "Street Address": string;
  City: string;
  State: string;
  "Zip Code": string;
  Notes: string;
  Confidence: string;
  "Est. Revenue Min": string;
  "Est. Revenue Max": string;
  Salesperson: string;
  "Created Date": string;
  "Last Contacted": string;
  "Projected Sales Date": string;
  Tags: string;
  "Sold Date": string;
  "Related Job": string;
  "Proposal Status": string;
  "Has Opportunity Been Contacted?": string;
};

function clean(s: string | null | undefined): string | null {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  return t === "" ? null : t;
}

function mapStage(status: string): { stage: LeadStage; unrecognized: boolean; tag?: string } {
  const key = status.trim().toLowerCase();
  if (key === "open" || key === "new") return { stage: LeadStage.NEW, unrecognized: false };
  if (key === "contacted") return { stage: LeadStage.CONTACTED, unrecognized: false };
  if (key === "qualified") return { stage: LeadStage.QUALIFIED, unrecognized: false };
  if (key === "proposal sent" || key === "proposal") return { stage: LeadStage.PROPOSAL_SENT, unrecognized: false };
  if (key === "sold" || key === "won") return { stage: LeadStage.WON, unrecognized: false };
  if (key === "lost" || key === "declined") return { stage: LeadStage.LOST, unrecognized: false };
  if (key === "no opportunity") return { stage: LeadStage.NEW, unrecognized: true, tag: "bt:no-opportunity" };
  return { stage: LeadStage.NEW, unrecognized: true, tag: `bt-status:${status}` };
}

function moneyCents(raw: string): number | null {
  const c = clean(raw);
  if (!c) return null;
  try {
    return parseDollarsToCents(c);
  } catch {
    const n = Number(c);
    if (!Number.isFinite(n)) return null;
    return Math.round(n * 100);
  }
}

function parseIsoDate(raw: string): Date | null {
  const c = clean(raw);
  if (!c) return null;
  const d = new Date(c);
  return Number.isNaN(d.getTime()) ? null : d;
}

function buildNotes(row: Row): string | null {
  const parts: string[] = [];
  const notes = clean(row.Notes);
  if (notes) parts.push(notes);
  const meta: string[] = [];
  if (clean(row["Last Contacted"])) meta.push(`Last contacted: ${row["Last Contacted"]}`);
  if (clean(row["Sold Date"])) meta.push(`Sold date: ${row["Sold Date"]}`);
  if (clean(row["Related Job"])) meta.push(`Related job: ${row["Related Job"]}`);
  if (clean(row["Proposal Status"])) meta.push(`BT proposal status: ${row["Proposal Status"]}`);
  if (clean(row["Has Opportunity Been Contacted?"])) {
    meta.push(`Contacted?: ${row["Has Opportunity Been Contacted?"]}`);
  }
  if (meta.length) parts.push(`[BT import meta] ${meta.join(" · ")}`);
  return parts.length ? parts.join("\n\n") : null;
}

function parseTags(row: Row, extra?: string): string[] {
  const tags = new Set<string>();
  const raw = clean(row.Tags);
  if (raw) {
    for (const t of raw.split(/[,;|]/)) {
      const x = t.trim();
      if (x) tags.add(x);
    }
  }
  if (extra) tags.add(extra);
  return [...tags];
}

async function main() {
  const db = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
  });

  const rows = JSON.parse(readFileSync("/tmp/leads-damien-2026-10-31.json", "utf8")) as Row[];

  const users = await db.user.findMany({
    where: { organizationId: ORG },
    select: { id: true, name: true, email: true },
  });
  const userByName = new Map(
    users.map((u) => [normalizePersonName(u.name ?? ""), u.id]),
  );

  const existing = await db.lead.findMany({
    where: { organizationId: ORG },
    select: {
      id: true,
      title: true,
      name: true,
      email: true,
      phone: true,
      source: true,
      stage: true,
      addressLine1: true,
      city: true,
      state: true,
      postalCode: true,
      notes: true,
      confidencePercent: true,
      projectedSalesDate: true,
      estimatedRevenueMinCents: true,
      estimatedRevenueMaxCents: true,
      projectType: true,
      tags: true,
      assignedUserId: true,
    },
  });

  type LeadRow = (typeof existing)[number];
  const byKey = new Map<string, LeadRow>();
  for (const lead of existing) {
    byKey.set(normalizeLeadKey(lead.title, lead.name, lead.email, lead.addressLine1), lead);
    byKey.set(normalizeLeadKey(lead.title, lead.name, lead.email), lead);
  }

  const summary = {
    rowsRead: rows.length,
    created: 0,
    updated: 0,
    unchanged: 0,
    stageSynced: 0,
    statusUnrecognized: 0,
    byStatus: {} as Record<string, number>,
    salespersonUnmatched: [] as string[],
    samplesCreated: [] as string[],
    samplesUpdated: [] as string[],
  };

  for (const row of rows) {
    summary.byStatus[row.Status] = (summary.byStatus[row.Status] ?? 0) + 1;
    const mapped = mapStage(row.Status || "Open");
    if (mapped.unrecognized) summary.statusUnrecognized += 1;

    const title = clean(row.Title);
    const name = clean(row["Client Contact"]) ?? title ?? "Unknown";
    const email = clean(row.Email)?.toLowerCase() ?? null;
    const phone = clean(row.Phone);
    const address = clean(row["Street Address"]);
    const city = clean(row.City);
    const state = clean(row.State)?.toUpperCase() ?? null;
    const postal = clean(row["Zip Code"]);
    const source = clean(row.Source);
    const projectType = clean(row["Project Type"]);
    const notes = buildNotes(row);
    const confidence = Math.min(100, Math.max(0, Number(row.Confidence) || 0));
    const revMin = moneyCents(row["Est. Revenue Min"]);
    const revMax = moneyCents(row["Est. Revenue Max"]);
    const projected = parseIsoDate(row["Projected Sales Date"]);
    const tags = parseTags(row, mapped.tag);

    // Damien rule: keep Brian/William from BT cell; everyone else / blank → Brian.
    const spResolved = resolveLeadSalespersonUserId(row.Salesperson, userByName);
    const assignedUserId = spResolved.userId;
    const spRaw = clean(row.Salesperson);
    if (spRaw && spResolved.reason === "default-brian" && !summary.salespersonUnmatched.includes(spRaw)) {
      summary.salespersonUnmatched.push(spRaw);
    }

    const key = normalizeLeadKey(title, name, email, address);
    const legacy = normalizeLeadKey(title, name, email);
    const match = byKey.get(key) ?? byKey.get(legacy);

    if (!match) {
      const lead = await createLead({
        organizationId: ORG,
        title,
        name,
        email,
        phone,
        source,
        addressLine1: address,
        city,
        state,
        postalCode: postal,
        notes,
        projectType,
        confidencePercent: confidence,
        estimatedRevenueMinCents: revMin,
        estimatedRevenueMaxCents: revMax,
        projectedSalesDate: projected,
        tags,
        assignedUserId,
      });
      if (mapped.stage !== LeadStage.NEW) {
        await db.lead.update({ where: { id: lead.id }, data: { stage: mapped.stage } });
      }
      summary.created += 1;
      if (summary.samplesCreated.length < 5) summary.samplesCreated.push(`${title} [${row.Status}]`);
      const createdRow = {
        ...lead,
        stage: mapped.stage,
        tags,
        phone,
        source,
        addressLine1: address,
        city,
        state,
        postalCode: postal,
        notes,
        confidencePercent: confidence,
        projectedSalesDate: projected,
        estimatedRevenueMinCents: revMin,
        estimatedRevenueMaxCents: revMax,
        projectType,
        assignedUserId,
      } as LeadRow;
      byKey.set(key, createdRow);
      byKey.set(legacy, createdRow);
      continue;
    }

    // Upsert / gap-fill existing
    const data: Record<string, unknown> = {};
    if (mapped.stage !== match.stage) {
      data.stage = mapped.stage;
      summary.stageSynced += 1;
    }
    if (title && !match.title) data.title = title;
    if (phone && !match.phone) data.phone = phone;
    if (source && !match.source) data.source = source;
    if (address && !match.addressLine1) data.addressLine1 = address;
    if (city && !match.city) data.city = city;
    if (state && !match.state) data.state = state;
    if (postal && !match.postalCode) data.postalCode = postal;
    if (projectType && !match.projectType) data.projectType = projectType;
    if (projected && !match.projectedSalesDate) data.projectedSalesDate = projected;
    if (revMin != null && (match.estimatedRevenueMinCents == null || match.estimatedRevenueMinCents === 0) && revMin > 0) {
      data.estimatedRevenueMinCents = revMin;
    }
    if (revMax != null && (match.estimatedRevenueMaxCents == null || match.estimatedRevenueMaxCents === 0) && revMax > 0) {
      data.estimatedRevenueMaxCents = revMax;
    }
    if (confidence > 0 && (match.confidencePercent ?? 0) === 0) data.confidencePercent = confidence;
    // Always enforce salesperson keep-list (not gap-fill only).
    if (match.assignedUserId !== assignedUserId) data.assignedUserId = assignedUserId;
    // Prefer longer BT notes when existing notes are empty or shorter
    if (notes && (!match.notes || notes.length > match.notes.length + 20)) data.notes = notes;
    // Merge tags
    const mergedTags = [...new Set([...(match.tags ?? []), ...tags])];
    if (mergedTags.length !== (match.tags ?? []).length) data.tags = mergedTags;

    if (Object.keys(data).length === 0) {
      summary.unchanged += 1;
      continue;
    }
    await db.lead.update({ where: { id: match.id }, data });
    summary.updated += 1;
    if (summary.samplesUpdated.length < 5) {
      summary.samplesUpdated.push(`${match.title ?? match.name} ← ${Object.keys(data).join(",")}`);
    }
    Object.assign(match, data);
  }

  const after = await db.lead.groupBy({
    by: ["stage"],
    where: { organizationId: ORG },
    _count: true,
  });
  const total = await db.lead.count({ where: { organizationId: ORG } });

  const report = { ...summary, afterStages: after, totalLeads: total };
  console.log(JSON.stringify(report, null, 2));
  writeFileSync("/tmp/leads-damien-upsert-result.json", JSON.stringify(report, null, 2));
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
