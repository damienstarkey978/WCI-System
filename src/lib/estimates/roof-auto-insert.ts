/**
 * Roof auto-insert rules (Handoff parity CR P2 #18).
 * When any roofing cost code/line is present: 50/50 payment terms, 5-year
 * warranty language, wood-replacement + permit + dumpster lines, and block
 * send if SQ quantities lack a Roofr source.
 */

import type { ScheduleDraw } from "@/lib/proposals/payment-schedule";

export const ROOF_FIFTY_FIFTY_SCHEDULE: readonly ScheduleDraw[] = [
  { title: "Deposit due upon execution of this agreement", pctOfContractBasisPoints: 5_000, sortOrder: 0 },
  { title: "Due upon commencement of work", pctOfContractBasisPoints: 5_000, sortOrder: 1 },
];

export const ROOF_WARRANTY_BULLETS = [
  "World Construction Inc. warrants roofing workmanship for five (5) years from substantial completion.",
  "Manufacturer material warranties apply separately and are passed through to the Owner.",
] as const;

export const ROOF_WOOD_REPLACEMENT_LANGUAGE =
  "Damaged wood discovered during tear-off (decking, fascia, or framing) will be replaced as needed and billed as a change order at the prevailing unit rates unless already scoped.";

export const ROOF_AUTO_INSERT_LINE_TITLES = [
  "Roofing permit",
  "Dumpster / debris haul-off",
  "Wood replacement allowance (as needed)",
] as const;

export function isRoofingLine(params: {
  readonly title?: string | null;
  readonly description?: string | null;
  readonly groupLabel?: string | null;
  readonly costCodeCode?: string | null;
  readonly costCodeName?: string | null;
  readonly unit?: string | null;
}): boolean {
  const hay = [
    params.title,
    params.description,
    params.groupLabel,
    params.costCodeCode,
    params.costCodeName,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return /\broof/.test(hay) || /\bshingle/.test(hay) || /\btear[\s-]?off\b/.test(hay);
}

export function findMissingRoofAutoInsertTitles(
  existingTitles: readonly string[],
): readonly string[] {
  const lower = new Set(existingTitles.map((title) => title.trim().toLowerCase()));
  return ROOF_AUTO_INSERT_LINE_TITLES.filter((title) => !lower.has(title.toLowerCase()));
}

/** Block send when roof SQ lines have no Roofr citation in sourceNote/description. */
export function findRoofRoofrSourceIssues(
  lines: readonly {
    readonly title?: string | null;
    readonly description?: string | null;
    readonly groupLabel?: string | null;
    readonly costCodeCode?: string | null;
    readonly costCodeName?: string | null;
    readonly unit?: string | null;
    readonly sourceNote?: string | null;
    readonly quantityMilli?: number;
  }[],
): string[] {
  const issues: string[] = [];
  for (const line of lines) {
    if (!isRoofingLine(line) || line.unit?.toUpperCase() !== "SQ") continue;
    const qty = (line.quantityMilli ?? 0) / 1_000;
    if (qty <= 0) continue;
    const note = `${line.sourceNote ?? ""} ${line.description ?? ""}`.toLowerCase();
    if (!/roofr/.test(note)) {
      issues.push(
        `Roofing line "${line.title ?? "SQ"}" (${qty} SQ) must cite a Roofr source in sourceNote or description.`,
      );
    }
  }
  return issues;
}

export function shouldApplyRoofPaymentSchedule(
  lines: readonly {
    readonly title?: string | null;
    readonly description?: string | null;
    readonly groupLabel?: string | null;
    readonly costCodeCode?: string | null;
    readonly costCodeName?: string | null;
  }[],
): boolean {
  return lines.some((line) => isRoofingLine(line));
}
