/**
 * Bulk import of Subs/Vendors from a Buildertrend "Subs report" (Subs/vendors list →
 * export), saved as CSV. Idempotent by design so it's safe to re-run — including with a
 * richer export later (e.g. one that adds an Email column, which Buildertrend's default
 * Subs report does not include):
 *
 *   - A row whose company name matches an existing vendor (case/whitespace-insensitive)
 *     updates that vendor, but only fills fields that are still blank — it never
 *     overwrites something a person already typed into WCI OS.
 *   - Anything else creates a new vendor.
 *   - The same company listed twice in one file is merged into one.
 *
 * Buildertrend's "Activation" column (Active / Pending / Ready for Invite / No Email)
 * is deliberately NOT carried over: it describes the sub's Buildertrend portal login,
 * not WCI OS's. Imported vendors start un-invited here, so WCI OS's own activation
 * pill stays truthful ("No Email" if there's no email on file, "Inactive" otherwise).
 */

import { parseCsv } from "@/lib/directory/csv";
import { db } from "@/lib/db";

export class InvalidVendorSheetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidVendorSheetError";
  }
}

export interface VendorImportRow {
  readonly name: string;
  readonly divisions: readonly string[];
  readonly primaryContact: string | null;
  readonly email: string | null;
  readonly phone: string | null;
  readonly cellPhone: string | null;
}

export interface VendorImportSummary {
  readonly rowsRead: number;
  readonly created: number;
  /** Existing vendors that had at least one blank field filled in. */
  readonly updated: number;
  /** Existing vendors the file had nothing new for. */
  readonly unchanged: number;
  /** Extra rows for a company already seen earlier in the same file. */
  readonly duplicateRowsMerged: number;
  /** Emails left off because another vendor already has them (they're unique per organization). */
  readonly emailsSkipped: readonly string[];
}

/** "  PRIME  Wiring LLC " and "prime wiring llc" are the same company. */
export function normalizeVendorName(name: string): string {
  return name.replace(/\s+/g, " ").trim().toLowerCase();
}

function clean(value: string | undefined): string | null {
  const trimmed = (value ?? "").replace(/\s+/g, " ").trim();
  return trimmed === "" ? null : trimmed;
}

/** Buildertrend packs a sub's divisions into one cell as "Masonry, \nFinishes, \nSpecialties". */
export function parseDivisions(cell: string | undefined): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const part of (cell ?? "").split(/[,\n]+/)) {
    const division = part.replace(/\s+/g, " ").trim();
    if (division === "" || seen.has(division.toLowerCase())) continue;
    seen.add(division.toLowerCase());
    result.push(division);
  }
  return result;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const HEADER_ALIASES = {
  name: ["company", "company name", "name", "display name"],
  divisions: ["division", "divisions", "sub/vendor divisions", "trade"],
  primaryContact: ["primary contact", "contact", "contact name"],
  email: ["email", "e-mail", "primary email", "email address"],
  phone: ["phone", "primary phone", "office phone", "phone number"],
  cellPhone: ["cell", "cell phone", "mobile", "mobile phone"],
} as const;

export function parseVendorSheet(csvText: string): VendorImportRow[] {
  const table = parseCsv(csvText);

  const headerIndex = table.findIndex((row) => row.some((cell) => (HEADER_ALIASES.name as readonly string[]).includes(cell.trim().toLowerCase())));
  if (headerIndex === -1) {
    throw new InvalidVendorSheetError('Couldn\'t find a "Company" column. Export the Subs/vendors list from Buildertrend (or use a CSV with a header row that has a Company column) and try again.');
  }

  const header = table[headerIndex].map((cell) => cell.trim().toLowerCase());
  const column = (key: keyof typeof HEADER_ALIASES): number => header.findIndex((cell) => (HEADER_ALIASES[key] as readonly string[]).includes(cell));
  const index = {
    name: column("name"),
    divisions: column("divisions"),
    primaryContact: column("primaryContact"),
    email: column("email"),
    phone: column("phone"),
    cellPhone: column("cellPhone"),
  };

  const rows: VendorImportRow[] = [];
  for (const cells of table.slice(headerIndex + 1)) {
    const name = clean(cells[index.name]);
    if (!name) continue;

    const emailRaw = index.email === -1 ? null : clean(cells[index.email])?.toLowerCase() ?? null;
    rows.push({
      name,
      divisions: index.divisions === -1 ? [] : parseDivisions(cells[index.divisions]),
      primaryContact: index.primaryContact === -1 ? null : clean(cells[index.primaryContact]),
      email: emailRaw && EMAIL_PATTERN.test(emailRaw) ? emailRaw : null,
      phone: index.phone === -1 ? null : clean(cells[index.phone]),
      cellPhone: index.cellPhone === -1 ? null : clean(cells[index.cellPhone]),
    });
  }

  if (rows.length === 0) throw new InvalidVendorSheetError("The file has a header row but no vendors under it.");
  return rows;
}

/** Same company twice in one file → one row, keeping the first non-blank value of each field. */
function mergeDuplicateRows(rows: readonly VendorImportRow[]): { merged: VendorImportRow[]; duplicates: number } {
  const byName = new Map<string, VendorImportRow>();
  let duplicates = 0;

  for (const row of rows) {
    const key = normalizeVendorName(row.name);
    const existing = byName.get(key);
    if (!existing) {
      byName.set(key, row);
      continue;
    }
    duplicates += 1;
    byName.set(key, {
      name: existing.name,
      divisions: existing.divisions.length > 0 ? existing.divisions : row.divisions,
      primaryContact: existing.primaryContact ?? row.primaryContact,
      email: existing.email ?? row.email,
      phone: existing.phone ?? row.phone,
      cellPhone: existing.cellPhone ?? row.cellPhone,
    });
  }

  return { merged: [...byName.values()], duplicates };
}

export async function importVendors(organizationId: string, incoming: readonly VendorImportRow[]): Promise<VendorImportSummary> {
  const { merged, duplicates } = mergeDuplicateRows(incoming);

  const existingVendors = await db.vendor.findMany({
    where: { organizationId },
    select: { id: true, name: true, email: true, phone: true, cellPhone: true, primaryContact: true, divisions: true },
  });
  const existingByName = new Map(existingVendors.map((vendor) => [normalizeVendorName(vendor.name), vendor]));
  const takenEmails = new Set(existingVendors.flatMap((vendor) => (vendor.email ? [vendor.email.toLowerCase()] : [])));

  const creates: {
    organizationId: string;
    name: string;
    email: string | null;
    phone: string | null;
    cellPhone: string | null;
    primaryContact: string | null;
    divisions: string[];
  }[] = [];
  const updates: ReturnType<typeof db.vendor.update>[] = [];
  const emailsSkipped: string[] = [];
  let unchanged = 0;

  const claimEmail = (email: string | null): string | null => {
    if (!email) return null;
    if (takenEmails.has(email)) {
      emailsSkipped.push(email);
      return null;
    }
    takenEmails.add(email);
    return email;
  };

  for (const row of merged) {
    const existing = existingByName.get(normalizeVendorName(row.name));

    if (!existing) {
      creates.push({
        organizationId,
        name: row.name,
        email: claimEmail(row.email),
        phone: row.phone,
        cellPhone: row.cellPhone,
        primaryContact: row.primaryContact,
        divisions: [...row.divisions],
      });
      continue;
    }

    const data: Record<string, unknown> = {};
    if (!existing.email && row.email) {
      const email = claimEmail(row.email);
      if (email) data.email = email;
    }
    if (!existing.phone && row.phone) data.phone = row.phone;
    if (!existing.cellPhone && row.cellPhone) data.cellPhone = row.cellPhone;
    if (!existing.primaryContact && row.primaryContact) data.primaryContact = row.primaryContact;
    if (existing.divisions.length === 0 && row.divisions.length > 0) data.divisions = [...row.divisions];

    if (Object.keys(data).length === 0) {
      unchanged += 1;
    } else {
      updates.push(db.vendor.update({ where: { id: existing.id }, data }));
    }
  }

  await db.$transaction([...(creates.length > 0 ? [db.vendor.createMany({ data: creates })] : []), ...updates]);

  return {
    rowsRead: incoming.length,
    created: creates.length,
    updated: updates.length,
    unchanged,
    duplicateRowsMerged: duplicates,
    emailsSkipped,
  };
}
