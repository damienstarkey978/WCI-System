/**
 * WCI lead salesperson assignment (Damien 2026-10-31):
 * - Keep Brian Wilkins or William Antonelli when they are the BT/XLS assignee.
 * - Otherwise (missing, unmatched, or anyone else) → Brian Wilkins.
 * Never invent other assignees.
 */

export const LEAD_SALESPERSON_BRIAN = "Brian Wilkins";
export const LEAD_SALESPERSON_WILLIAM = "William Antonelli";

export function normalizePersonName(name: string): string {
  return name.toLowerCase().replace(/\s+/g, " ").trim();
}

/** Split BT multi-assignee cells like "Brian Wilkins, William Antonelli". */
export function splitSalespersonCell(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => normalizePersonName(s))
    .filter(Boolean);
}

/**
 * Resolve assignedUserId for a lead from a BT salesperson cell + org user name map.
 * `userByName` keys must already be normalizePersonName()'d.
 */
export function resolveLeadSalespersonUserId(
  salespersonCell: string | null | undefined,
  userByName: ReadonlyMap<string, string>,
): { userId: string; reason: "brian" | "william" | "default-brian" } {
  const brianId = userByName.get(normalizePersonName(LEAD_SALESPERSON_BRIAN));
  const williamId = userByName.get(normalizePersonName(LEAD_SALESPERSON_WILLIAM));
  if (!brianId) {
    throw new Error(`Org user map missing required salesperson "${LEAD_SALESPERSON_BRIAN}"`);
  }

  const names = splitSalespersonCell(salespersonCell);
  if (names.some((n) => n === normalizePersonName(LEAD_SALESPERSON_BRIAN) || n.includes("brian wilkins"))) {
    return { userId: brianId, reason: "brian" };
  }
  if (
    williamId &&
    names.some((n) => n === normalizePersonName(LEAD_SALESPERSON_WILLIAM) || n.includes("william antonelli"))
  ) {
    return { userId: williamId, reason: "william" };
  }
  // Single exact keep-list match (defensive — same as above for one name)
  if (names.length === 1) {
    const only = names[0];
    if (only === normalizePersonName(LEAD_SALESPERSON_BRIAN)) return { userId: brianId, reason: "brian" };
    if (williamId && only === normalizePersonName(LEAD_SALESPERSON_WILLIAM)) {
      return { userId: williamId, reason: "william" };
    }
  }
  return { userId: brianId, reason: "default-brian" };
}

/**
 * Org-wide enforce: if assigned user is not Brian/William (or null), set Brian.
 */
export function enforceLeadSalespersonKeepList(
  assignedUserId: string | null | undefined,
  brianUserId: string,
  williamUserId: string | null,
): string {
  if (assignedUserId === brianUserId) return brianUserId;
  if (williamUserId && assignedUserId === williamUserId) return williamUserId;
  return brianUserId;
}
