/**
 * Repair Client Contacts whose display name is still a Buildertrend job/address
 * label (e.g. "1747 Debbie Ln-Suzanne Singleton-Bed/Bath Remodel") instead of a
 * person name. Import already prefers First+Last for new rows that start with a
 * digit (preferDisplayName); this rewrites existing rows in place.
 */

import { db } from "@/lib/db";

const SCOPE_HINT =
  /\b(remodel|addition|roof|adu|kitchen|bath|bathroom|floor|flooring|paint|concrete|commercial|warranty|siding|windows?|doors?|hvac|electrical|plumbing|demo|restoration|enclosure|pavillion|pavilion|garage|insurance|build\s*out|tenant|conference|room)\b/i;

/**
 * Pull a person-shaped segment out of a BT-style "Address-Person-Scope" label.
 * Returns null when the name does not look address-led or no person segment is found.
 */
export function extractPersonNameFromJobStyleLabel(raw: string): string | null {
  const name = raw.replace(/\s+/g, " ").trim();
  if (!name || !/^\d/.test(name)) return null;

  // Prefer " - " separators (common on open jobs), else bare "-".
  const parts = name.includes(" - ")
    ? name.split(/\s+-\s+/).map((part) => part.trim()).filter(Boolean)
    : name.split("-").map((part) => part.trim()).filter(Boolean);

  if (parts.length < 2) return null;

  // Skip the leading address chunk; score remaining segments for person-ness.
  for (let i = 1; i < parts.length; i += 1) {
    const segment = parts[i];
    if (SCOPE_HINT.test(segment)) continue;
    if (/^\d/.test(segment)) continue;
    // Person names: 1–4 words of letters (allow apostrophes / periods / &).
    if (!/^[A-Za-z][A-Za-z.'’&\s]+$/.test(segment)) continue;
    const words = segment.split(/\s+/).filter(Boolean);
    if (words.length < 1 || words.length > 4) continue;
    // Prefer multi-word ("Suzanne Singleton"); accept single if later segments are scope-only.
    if (words.length >= 2) return segment;
    // Single-word fallback only when every later segment looks like scope.
    const later = parts.slice(i + 1);
    if (later.length > 0 && later.every((part) => SCOPE_HINT.test(part) || part.length < 3)) {
      return segment;
    }
  }
  return null;
}

export interface ClientNameRepairPreview {
  readonly id: string;
  readonly before: string;
  readonly after: string;
  readonly email: string;
}

export async function findJobStyleClientNames(organizationId: string): Promise<readonly ClientNameRepairPreview[]> {
  const clients = await db.client.findMany({
    where: { organizationId, name: { not: "" } },
    select: { id: true, name: true, email: true },
  });
  const out: ClientNameRepairPreview[] = [];
  for (const client of clients) {
    const after = extractPersonNameFromJobStyleLabel(client.name);
    if (!after || after === client.name) continue;
    out.push({ id: client.id, before: client.name, after, email: client.email });
  }
  return out;
}

export async function repairJobStyleClientNames(
  organizationId: string,
  opts: { dryRun?: boolean } = {},
): Promise<{ readonly repaired: number; readonly preview: readonly ClientNameRepairPreview[] }> {
  const preview = await findJobStyleClientNames(organizationId);
  if (opts.dryRun) return { repaired: 0, preview };
  for (const row of preview) {
    await db.client.update({ where: { id: row.id }, data: { name: row.after } });
  }
  return { repaired: preview.length, preview };
}
