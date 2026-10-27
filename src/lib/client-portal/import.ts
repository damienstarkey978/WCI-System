/**
 * Bulk import of Client Contacts from a Buildertrend "Client Contacts" report saved
 * as CSV. Same fill-blanks-on-match shape as Subs/vendors import
 * (src/lib/vendor-portal/import.ts):
 *
 *   - Match by email first (unique per org), else by display name
 *     (case/whitespace-insensitive).
 *   - On match, only fill fields that are still blank — never overwrite what a
 *     person already typed into WCI OS.
 *   - Create only when there is a usable email (Client.email is required) and no
 *     match. Rows without email that do not match an existing client are skipped.
 *   - Buildertrend's Activation Status is ignored — it describes their BT portal
 *     login, not WCI OS. No invite/email/SMS is ever sent.
 */

import { parseCsv } from "@/lib/directory/csv";
import { db } from "@/lib/db";
import { normalizeState, parseEmails } from "@/lib/vendor-portal/import";

export class InvalidClientSheetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidClientSheetError";
  }
}

export interface ClientImportRow {
  readonly name: string;
  readonly email: string | null;
  readonly extraEmails: readonly string[];
  readonly phone: string | null;
  readonly cellPhone: string | null;
  readonly addressLine1: string | null;
  readonly city: string | null;
  readonly state: string | null;
  readonly postalCode: string | null;
}

export interface ClientImportSummary {
  readonly rowsRead: number;
  readonly created: number;
  /** Existing clients that had at least one blank field filled in. */
  readonly updated: number;
  /** Existing clients the file had nothing new for. */
  readonly unchanged: number;
  /** Extra rows for a contact already seen earlier in the same file. */
  readonly duplicateRowsMerged: number;
  /** Rows with no email that did not match an existing client (cannot create). */
  readonly skippedNoEmail: number;
  /** Emails left off because another client already has them. */
  readonly emailsSkipped: readonly { name: string; email: string }[];
  /** Contacts whose email cell listed more than one address; the first was used. */
  readonly extraEmails: readonly { name: string; emails: readonly string[] }[];
}

export function normalizeClientName(name: string): string {
  return name.replace(/\s+/g, " ").trim().toLowerCase();
}

function clean(value: string | undefined): string | null {
  const trimmed = (value ?? "").replace(/\s+/g, " ").trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * Buildertrend's Excel → CSV path turns long phone numbers and zip codes into
 * floats ("19045740585.0", "32210.0"). Strip a trailing ".0" and keep the rest.
 */
export function normalizeSpreadsheetScalar(value: string | null): string | null {
  if (value === null) return null;
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (trimmed === "") return null;
  if (/^\d+\.0+$/.test(trimmed)) return trimmed.replace(/\.0+$/, "");
  return trimmed;
}

/**
 * Buildertrend's Name column is the display name. When it is an address-style
 * label (starts with a digit) and First/Last are present, prefer "First Last"
 * so new clients are people, not street addresses. Otherwise keep Name.
 */
export function preferDisplayName(name: string | null, firstName: string | null, lastName: string | null): string | null {
  const display = name?.replace(/\s+/g, " ").trim() || null;
  const first = firstName?.trim() ?? "";
  const last = lastName?.trim() ?? "";
  const fromParts = `${first} ${last}`.replace(/\s+/g, " ").trim();
  if (!display) return fromParts === "" ? null : fromParts;
  if (/^\d/.test(display) && fromParts !== "") return fromParts;
  return display;
}

const HEADER_ALIASES = {
  name: ["name", "display name", "client", "client name", "contact", "contact name"],
  firstName: ["first name", "firstname", "first"],
  lastName: ["last name", "lastname", "last"],
  email: ["email", "e-mail", "primary email", "email address", "emails"],
  phone: ["phone", "primary phone", "office phone", "phone number"],
  cellPhone: ["cell", "cell phone", "mobile", "mobile phone"],
  addressLine1: ["address", "street address", "address line 1", "street"],
  city: ["city"],
  state: ["state"],
  postalCode: ["zip", "zip code", "postal code", "zipcode"],
} as const;

export function parseClientSheet(csvText: string): ClientImportRow[] {
  const table = parseCsv(csvText);

  const headerIndex = table.findIndex((row) => row.some((cell) => (HEADER_ALIASES.name as readonly string[]).includes(cell.trim().toLowerCase())));
  if (headerIndex === -1) {
    throw new InvalidClientSheetError(
      'Couldn\'t find a "Name" column. Export Client Contacts from Buildertrend (or use a CSV with a header row that has a Name column) and try again.',
    );
  }

  const header = table[headerIndex].map((cell) => cell.trim().toLowerCase());
  const column = (key: keyof typeof HEADER_ALIASES): number => header.findIndex((cell) => (HEADER_ALIASES[key] as readonly string[]).includes(cell));
  const index = {
    name: column("name"),
    firstName: column("firstName"),
    lastName: column("lastName"),
    email: column("email"),
    phone: column("phone"),
    cellPhone: column("cellPhone"),
    addressLine1: column("addressLine1"),
    city: column("city"),
    state: column("state"),
    postalCode: column("postalCode"),
  };
  const cell = (cells: string[], key: keyof typeof index): string | null => (index[key] === -1 ? null : clean(cells[index[key]]));

  const rows: ClientImportRow[] = [];
  for (const cells of table.slice(headerIndex + 1)) {
    const rawName = cell(cells, "name");
    const displayName = preferDisplayName(rawName, cell(cells, "firstName"), cell(cells, "lastName"));
    if (!displayName) continue;

    const emails = index.email === -1 ? [] : parseEmails(cells[index.email] ?? "");
    rows.push({
      name: displayName,
      email: emails[0] ?? null,
      extraEmails: emails.slice(1),
      phone: normalizeSpreadsheetScalar(cell(cells, "phone")),
      cellPhone: normalizeSpreadsheetScalar(cell(cells, "cellPhone")),
      addressLine1: cell(cells, "addressLine1"),
      city: cell(cells, "city"),
      state: normalizeState(cell(cells, "state")),
      postalCode: normalizeSpreadsheetScalar(cell(cells, "postalCode")),
    });
  }

  if (rows.length === 0) throw new InvalidClientSheetError("The file has a header row but no client contacts under it.");
  return rows;
}

function mergeDuplicateRows(rows: readonly ClientImportRow[]): { merged: ClientImportRow[]; duplicates: number } {
  const byKey = new Map<string, ClientImportRow>();
  let duplicates = 0;

  for (const row of rows) {
    const key = row.email ? `email:${row.email}` : `name:${normalizeClientName(row.name)}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, row);
      continue;
    }
    duplicates += 1;
    byKey.set(key, {
      name: existing.name,
      email: existing.email ?? row.email,
      extraEmails: existing.extraEmails.length > 0 ? existing.extraEmails : row.extraEmails,
      phone: existing.phone ?? row.phone,
      cellPhone: existing.cellPhone ?? row.cellPhone,
      addressLine1: existing.addressLine1 ?? row.addressLine1,
      city: existing.city ?? row.city,
      state: existing.state ?? row.state,
      postalCode: existing.postalCode ?? row.postalCode,
    });
  }

  return { merged: [...byKey.values()], duplicates };
}

export async function importClients(organizationId: string, incoming: readonly ClientImportRow[]): Promise<ClientImportSummary> {
  const { merged, duplicates } = mergeDuplicateRows(incoming);

  const existingClients = await db.client.findMany({
    where: { organizationId },
    select: { id: true, name: true, email: true, phone: true, cellPhone: true, addressLine1: true, city: true, state: true, postalCode: true },
  });
  const existingByEmail = new Map(existingClients.filter((client) => client.email).map((client) => [client.email.toLowerCase(), client]));
  const existingByName = new Map(existingClients.map((client) => [normalizeClientName(client.name), client]));
  const takenEmails = new Set(existingClients.map((client) => client.email.toLowerCase()));

  const creates: {
    organizationId: string;
    name: string;
    email: string;
    phone: string | null;
    cellPhone: string | null;
    addressLine1: string | null;
    city: string | null;
    state: string | null;
    postalCode: string | null;
  }[] = [];
  const updates: ReturnType<typeof db.client.update>[] = [];
  const emailsSkipped: { name: string; email: string }[] = [];
  const extraEmails: { name: string; emails: readonly string[] }[] = [];
  let unchanged = 0;
  let skippedNoEmail = 0;

  const claimEmail = (name: string, email: string | null): string | null => {
    if (!email) return null;
    if (takenEmails.has(email)) {
      emailsSkipped.push({ name, email });
      return null;
    }
    takenEmails.add(email);
    return email;
  };

  for (const row of merged) {
    if (row.extraEmails.length > 0) extraEmails.push({ name: row.name, emails: row.extraEmails });

    const existing = (row.email ? existingByEmail.get(row.email) : undefined) ?? existingByName.get(normalizeClientName(row.name));

    if (!existing) {
      if (!row.email) {
        skippedNoEmail += 1;
        continue;
      }
      const email = claimEmail(row.name, row.email);
      if (!email) {
        skippedNoEmail += 1;
        continue;
      }
      creates.push({
        organizationId,
        name: row.name,
        email,
        phone: row.phone,
        cellPhone: row.cellPhone,
        addressLine1: row.addressLine1,
        city: row.city,
        state: row.state,
        postalCode: row.postalCode,
      });
      continue;
    }

    const data: Record<string, unknown> = {};
    // Email is required and unique — only fill when the existing row somehow lacks a
    // usable match path (it always has email in schema; keep the blank-fill shape for phone/address).
    if (!existing.phone && row.phone) data.phone = row.phone;
    if (!existing.cellPhone && row.cellPhone) data.cellPhone = row.cellPhone;
    if (!existing.addressLine1 && row.addressLine1) data.addressLine1 = row.addressLine1;
    if (!existing.city && row.city) data.city = row.city;
    if (!existing.state && row.state) data.state = row.state;
    if (!existing.postalCode && row.postalCode) data.postalCode = row.postalCode;

    if (Object.keys(data).length === 0) {
      unchanged += 1;
    } else {
      updates.push(db.client.update({ where: { id: existing.id }, data }));
    }
  }

  await db.$transaction([...(creates.length > 0 ? [db.client.createMany({ data: creates })] : []), ...updates]);

  return {
    rowsRead: incoming.length,
    created: creates.length,
    updated: updates.length,
    unchanged,
    duplicateRowsMerged: duplicates,
    skippedNoEmail,
    emailsSkipped,
    extraEmails,
  };
}
