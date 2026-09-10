/**
 * Cost-code grouping for the job costing screen.
 *
 * WCI's cost codes are a two-level hierarchy — "02 Concrete/ Foundations" is the
 * parent of "02-CONCRETE-FOUNDATION-LABOR" and its siblings — but budget lines hang
 * off the leaves. A job with 40 lines is unreadable flat, so this rolls the leaves
 * up under their parent and subtotals each group.
 *
 * Pure on purpose: the page hands in the lines and a lookup, and gets back an
 * ordered structure it can render. No database, no formatting.
 */

import { sumFunnelLines, type FunnelLine, type FunnelSubtotal } from "@/lib/budget/funnel";

export interface CostCodeGroupRef {
  readonly id: string;
  readonly code: string;
  readonly name: string;
}

export interface BudgetGroupLine {
  readonly line: FunnelLine;
  readonly code: string;
  readonly name: string;
}

export interface BudgetGroup {
  readonly key: string;
  readonly code: string;
  readonly name: string;
  readonly lines: readonly BudgetGroupLine[];
  readonly subtotal: FunnelSubtotal;
  /** True when any line in the group has run past its revised budget. */
  readonly hasOverBudgetLine: boolean;
}

/** Where a line lands when its cost code has no parent — an orphan, not a mistake. */
export const UNGROUPED_KEY = "__ungrouped__";

export interface CostCodeLookupEntry {
  readonly code: string;
  readonly name: string;
  readonly group: CostCodeGroupRef | null;
}

/**
 * Group and subtotal. Groups come back ordered by cost code, which is how the office
 * reads a budget (01 pre-construction through 19 framing); ungrouped lines land in a
 * single group at the end rather than being dropped, because a line the screen can't
 * place is still money the job owes.
 */
export function groupFunnelLines(
  lines: readonly FunnelLine[],
  costCodes: Readonly<Record<string, CostCodeLookupEntry>>,
): readonly BudgetGroup[] {
  const buckets = new Map<string, { code: string; name: string; lines: BudgetGroupLine[] }>();

  for (const line of lines) {
    const entry = costCodes[line.costCodeId];
    const group = entry?.group ?? null;
    const key = group?.id ?? UNGROUPED_KEY;

    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = {
        // Sorting is by code, so the ungrouped bucket takes a code that sorts last
        // rather than one that would interleave it with real groups.
        code: group?.code ?? "￿",
        name: group?.name ?? "Ungrouped",
        lines: [],
      };
      buckets.set(key, bucket);
    }
    bucket.lines.push({ line, code: entry?.code ?? "", name: entry?.name ?? "Unknown cost code" });
  }

  return [...buckets.entries()]
    .map(([key, bucket]) => {
      const sorted = [...bucket.lines].sort((a, b) => a.code.localeCompare(b.code));
      return {
        key,
        code: bucket.code === "￿" ? "" : bucket.code,
        name: bucket.name,
        lines: sorted,
        subtotal: sumFunnelLines(sorted.map((entry) => entry.line)),
        hasOverBudgetLine: sorted.some((entry) => entry.line.isOverBudget),
      };
    })
    .sort((a, b) => (a.key === UNGROUPED_KEY ? 1 : b.key === UNGROUPED_KEY ? -1 : a.code.localeCompare(b.code)));
}
