/**
 * Pure comparison-grid computation for the Bid Comparison view
 * (src/app/jobs/[jobId]/bids/[bidPackageId]/compare). No database, no framework —
 * the same split used by the funnel and report modules, so both the comparison
 * table and the AI-summary context builder read from one computed structure
 * rather than deriving vendor totals twice.
 */

import { extendedCostCents } from "@/lib/budget/funnel";
import { formatMoney } from "@/lib/format";
import type { Cents } from "@/lib/money";

export interface ComparisonLineItemInput {
  readonly id: string;
  readonly title: string;
  readonly unit: string | null;
  readonly quantityMilli: number | null;
}

export interface ComparisonSubmissionLineItemInput {
  readonly bidPackageLineItemId: string | null;
  readonly title: string;
  readonly quantityMilli: number;
  readonly unitCostCents: Cents;
}

export interface ComparisonSubmissionInput {
  readonly id: string;
  readonly vendorName: string;
  readonly status: string;
  readonly totalCents: Cents | null;
  readonly notes: string | null;
  readonly lineItems: readonly ComparisonSubmissionLineItemInput[];
}

export interface ComparisonRow {
  readonly lineItemId: string;
  readonly title: string;
  readonly unit: string | null;
  readonly quantityMilli: number | null;
  /** Extended cost per submission id, or null where that vendor didn't itemize this line. */
  readonly cellsBySubmissionId: Readonly<Record<string, Cents | null>>;
}

export interface ComparisonColumn {
  readonly submissionId: string;
  readonly vendorName: string;
  readonly status: string;
  /** True once this vendor gave line-item pricing rather than a single flat number. */
  readonly isItemized: boolean;
  /** Sum of matched line items when itemized; otherwise the submission's own flat total. */
  readonly totalCents: Cents | null;
  readonly notes: string | null;
  /** Vendor-submitted lines that don't answer any of this package's own line items. */
  readonly unmatchedItems: readonly { readonly title: string; readonly extendedCostCents: Cents }[];
}

export interface ComparisonResult {
  readonly rows: readonly ComparisonRow[];
  readonly columns: readonly ComparisonColumn[];
  /** Submission id of the lowest total among columns with a total, or null if none. */
  readonly lowestTotalSubmissionId: string | null;
}

export function computeBidComparison(
  lineItems: readonly ComparisonLineItemInput[],
  submissions: readonly ComparisonSubmissionInput[],
): ComparisonResult {
  const perSubmission = submissions.map((submission) => {
    const isItemized = submission.lineItems.length > 0;
    const matched = submission.lineItems.filter((line) => line.bidPackageLineItemId !== null);
    const unmatched = submission.lineItems.filter((line) => line.bidPackageLineItemId === null);

    const totalCents = isItemized
      ? submission.lineItems.reduce((total, line) => total + extendedCostCents(line.quantityMilli, line.unitCostCents), 0)
      : submission.totalCents;

    const column: ComparisonColumn = {
      submissionId: submission.id,
      vendorName: submission.vendorName,
      status: submission.status,
      isItemized,
      totalCents,
      notes: submission.notes,
      unmatchedItems: unmatched.map((line) => ({ title: line.title, extendedCostCents: extendedCostCents(line.quantityMilli, line.unitCostCents) })),
    };

    return { column, matched };
  });

  const rows: ComparisonRow[] = lineItems.map((lineItem) => {
    const cellsBySubmissionId: Record<string, Cents | null> = {};
    for (const { column, matched } of perSubmission) {
      const line = matched.find((candidate) => candidate.bidPackageLineItemId === lineItem.id);
      cellsBySubmissionId[column.submissionId] = line ? extendedCostCents(line.quantityMilli, line.unitCostCents) : null;
    }
    return { lineItemId: lineItem.id, title: lineItem.title, unit: lineItem.unit, quantityMilli: lineItem.quantityMilli, cellsBySubmissionId };
  });

  const columns = perSubmission.map(({ column }) => column);
  const withTotals = columns.filter((column) => column.totalCents !== null);
  const lowestTotalSubmissionId =
    withTotals.length === 0
      ? null
      : withTotals.reduce((lowest, column) => (column.totalCents! < lowest.totalCents! ? column : lowest)).submissionId;

  return { rows, columns, lowestTotalSubmissionId };
}

/** Renders a ComparisonResult as plain text for src/lib/ai/bid-comparison-assistant.ts's prompt — the one place both the table and the AI summary read their numbers from. */
export function buildComparisonContextText(result: ComparisonResult): string {
  const sections: string[] = [];

  for (const column of result.columns) {
    const parts = [
      `${column.vendorName}: ${column.status}`,
      column.status === "INVITED" || column.status === "DRAFT"
        ? "has not bid yet"
        : `${column.isItemized ? "itemized" : "flat (not itemized)"}, total ${column.totalCents === null ? "unknown" : formatMoney(column.totalCents)}`,
    ];
    if (column.unmatchedItems.length > 0) {
      parts.push(`extra items not on the original list: ${column.unmatchedItems.map((item) => `${item.title} (${formatMoney(item.extendedCostCents)})`).join(", ")}`);
    }
    if (column.notes) parts.push(`notes: "${column.notes}"`);
    sections.push(parts.join(" — "));
  }

  const itemizedColumns = result.columns.filter((column) => column.isItemized);
  if (itemizedColumns.length > 0) {
    sections.push("");
    sections.push("Line-item breakdown (itemized vendors only):");
    for (const row of result.rows) {
      const perVendor = itemizedColumns
        .map((column) => {
          const cell = row.cellsBySubmissionId[column.submissionId];
          return cell === null || cell === undefined ? null : `${column.vendorName} ${formatMoney(cell)}`;
        })
        .filter((entry): entry is string => entry !== null);
      if (perVendor.length > 0) sections.push(`- ${row.title}: ${perVendor.join(", ")}`);
    }
  }

  return sections.join("\n");
}
