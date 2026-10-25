/**
 * Bulk import of Lead Opportunities from a CSV (Buildertrend's "Import Leads" /
 * lead-opportunities export, or any CSV with a Title or Contact column). Additive and
 * safe to re-run, like the Subs/vendors import (src/lib/vendor-portal/import.ts):
 *
 *   - A row whose title and email already match an existing lead is skipped, never
 *     overwritten, so nothing a person typed into WCI OS is touched.
 *   - Everything else is created through createLead(), so imported leads are ordinary
 *     leads (stage NEW unless the file carries a recognised Status).
 *   - No email, message or invite is ever sent; this only writes Lead rows.
 */

import { LeadStage } from "@/generated/prisma/enums";
import { createLead } from "@/lib/crm/service";
import { db } from "@/lib/db";
import { parseCsv } from "@/lib/directory/csv";
import { parseDollarsToCents } from "@/lib/money";

export class InvalidLeadSheetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidLeadSheetError";
  }
}

export interface LeadImportRow {
  readonly title: string | null;
  readonly name: string;
  readonly email: string | null;
  readonly phone: string | null;
  readonly source: string | null;
  readonly stage: LeadStage;
  /** True when the Status cell had text that did not map to a stage (the lead is imported as NEW). */
  readonly statusUnrecognized: boolean;
  readonly projectType: string | null;
  readonly addressLine1: string | null;
  readonly city: string | null;
  readonly state: string | null;
  readonly postalCode: string | null;
  readonly notes: string | null;
  readonly confidencePercent: number;
  readonly estimatedRevenueMinCents: number | null;
  readonly estimatedRevenueMaxCents: number | null;
}

export interface LeadImportSummary {
  readonly rowsRead: number;
  readonly created: number;
  /** Rows skipped because a lead with the same title and email already exists (or repeats earlier in the file). */
  readonly skippedExisting: number;
  /** Rows whose Status text did not match a known stage; imported as NEW. */
  readonly statusUnrecognized: number;
}

const HEADER_ALIASES = {
  title: ["title", "lead title", "opportunity", "opportunity title", "lead opportunity"],
  name: ["client contact", "contact", "contact name", "name", "client", "client name"],
  email: ["email", "e-mail", "contact email", "email address"],
  phone: ["phone", "contact phone", "phone number", "cell", "mobile"],
  source: ["source", "lead source"],
  status: ["status", "lead status", "stage"],
  projectType: ["project type", "type"],
  addressLine1: ["street address", "address", "address line 1", "street"],
  city: ["city"],
  state: ["state"],
  postalCode: ["zip code", "zip", "postal code", "zipcode"],
  notes: ["notes", "note", "description"],
  confidence: ["confidence", "confidence %", "confidence percent"],
  revenueMin: ["est. revenue min", "estimated revenue min", "revenue min", "min revenue"],
  revenueMax: ["est. revenue max", "estimated revenue max", "revenue max", "max revenue"],
} as const;

const STAGE_BY_TEXT: Record<string, LeadStage> = {
  new: LeadStage.NEW,
  open: LeadStage.NEW,
  contacted: LeadStage.CONTACTED,
  qualified: LeadStage.QUALIFIED,
  "proposal sent": LeadStage.PROPOSAL_SENT,
  proposal: LeadStage.PROPOSAL_SENT,
  won: LeadStage.WON,
  sold: LeadStage.WON,
  lost: LeadStage.LOST,
  declined: LeadStage.LOST,
};

function clean(value: string | undefined): string | null {
  const trimmed = (value ?? "").replace(/\s+/g, " ").trim();
  return trimmed === "" ? null : trimmed;
}

function parseMoneyCell(value: string | undefined): number | null {
  const cell = clean(value);
  if (cell === null) return null;
  try {
    return parseDollarsToCents(cell);
  } catch {
    return null;
  }
}

export function normalizeLeadKey(title: string | null, name: string, email: string | null): string {
  return `${(title ?? name).toLowerCase().replace(/\s+/g, " ").trim()}|${(email ?? "").toLowerCase().trim()}`;
}

export function parseLeadSheet(csvText: string): LeadImportRow[] {
  const table = parseCsv(csvText);

  const known = [...HEADER_ALIASES.title, ...HEADER_ALIASES.name] as readonly string[];
  const headerIndex = table.findIndex((row) => row.some((cell) => known.includes(cell.trim().toLowerCase())));
  if (headerIndex === -1) {
    throw new InvalidLeadSheetError('Couldn\'t find a "Title" or "Client contact" column. Use a CSV with a header row that has one of those columns and try again.');
  }

  const header = table[headerIndex].map((cell) => cell.trim().toLowerCase());
  const column = (key: keyof typeof HEADER_ALIASES): number => header.findIndex((cell) => (HEADER_ALIASES[key] as readonly string[]).includes(cell));
  const index = {
    title: column("title"),
    name: column("name"),
    email: column("email"),
    phone: column("phone"),
    source: column("source"),
    status: column("status"),
    projectType: column("projectType"),
    addressLine1: column("addressLine1"),
    city: column("city"),
    state: column("state"),
    postalCode: column("postalCode"),
    notes: column("notes"),
    confidence: column("confidence"),
    revenueMin: column("revenueMin"),
    revenueMax: column("revenueMax"),
  };
  const cell = (cells: string[], key: keyof typeof index): string | null => (index[key] === -1 ? null : clean(cells[index[key]]));

  const rows: LeadImportRow[] = [];
  for (const cells of table.slice(headerIndex + 1)) {
    const title = cell(cells, "title");
    const name = cell(cells, "name") ?? title;
    if (!name) continue;

    const statusText = cell(cells, "status");
    const mappedStage = statusText ? STAGE_BY_TEXT[statusText.toLowerCase()] : undefined;
    const confidenceRaw = cell(cells, "confidence");
    const confidence = confidenceRaw ? Math.round(Number(confidenceRaw.replace("%", ""))) : 0;

    rows.push({
      title,
      name,
      email: cell(cells, "email")?.toLowerCase() ?? null,
      phone: cell(cells, "phone"),
      source: cell(cells, "source"),
      stage: mappedStage ?? LeadStage.NEW,
      statusUnrecognized: statusText !== null && mappedStage === undefined,
      projectType: cell(cells, "projectType"),
      addressLine1: cell(cells, "addressLine1"),
      city: cell(cells, "city"),
      state: cell(cells, "state")?.toUpperCase() ?? null,
      postalCode: cell(cells, "postalCode"),
      notes: cell(cells, "notes"),
      confidencePercent: Number.isFinite(confidence) ? Math.min(100, Math.max(0, confidence)) : 0,
      estimatedRevenueMinCents: parseMoneyCell(cells[index.revenueMin]),
      estimatedRevenueMaxCents: parseMoneyCell(cells[index.revenueMax]),
    });
  }

  if (rows.length === 0) throw new InvalidLeadSheetError("The file has a header row but no leads under it.");
  return rows;
}

export async function importLeads(organizationId: string, incoming: readonly LeadImportRow[]): Promise<LeadImportSummary> {
  const existing = await db.lead.findMany({ where: { organizationId }, select: { title: true, name: true, email: true } });
  const seen = new Set(existing.map((lead) => normalizeLeadKey(lead.title, lead.name, lead.email)));

  let created = 0;
  let skippedExisting = 0;
  let statusUnrecognized = 0;

  for (const row of incoming) {
    const key = normalizeLeadKey(row.title, row.name, row.email);
    if (seen.has(key)) {
      skippedExisting += 1;
      continue;
    }
    seen.add(key);

    const lead = await createLead({
      organizationId,
      title: row.title,
      name: row.name,
      email: row.email,
      phone: row.phone,
      source: row.source,
      addressLine1: row.addressLine1,
      city: row.city,
      state: row.state,
      postalCode: row.postalCode,
      notes: row.notes,
      projectType: row.projectType,
      confidencePercent: row.confidencePercent,
      estimatedRevenueMinCents: row.estimatedRevenueMinCents,
      estimatedRevenueMaxCents: row.estimatedRevenueMaxCents,
    });
    if (row.stage !== LeadStage.NEW) await db.lead.update({ where: { id: lead.id }, data: { stage: row.stage } });
    if (row.statusUnrecognized) statusUnrecognized += 1;
    created += 1;
  }

  return { rowsRead: incoming.length, created, skippedExisting, statusUnrecognized };
}
