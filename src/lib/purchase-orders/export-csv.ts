import { formatDate, formatMoney } from "@/lib/format";

import {
  formatPoNumberDisplay,
  formatPoStatusLabel,
  formatWorkStatusLabel,
} from "./display";

/** Minimal row shape for PO list CSV export (Buildertrend Export). */
export interface PoExportRow {
  readonly jobName: string;
  readonly poNumber: string;
  readonly poSuffix: string | null;
  readonly title: string | null;
  readonly status: string;
  readonly workStatus: string;
  readonly vendorName: string;
  readonly createdAt: string;
  readonly totalCents: number;
}

function csvCell(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

/**
 * Buildertrend-style Purchase Orders CSV for the list Export control.
 * Columns match the Standard View (Job, PO #, Title, statuses, vendor, date, total).
 */
export function purchaseOrdersToCsv(rows: readonly PoExportRow[]): string {
  const header = [
    "Job",
    "PO #",
    "Title",
    "PO Status",
    "Work Status",
    "Performed By",
    "Created Date",
    "Total",
  ];
  const lines = [header.join(",")];
  for (const row of rows) {
    const vendor = row.vendorName?.trim();
    const performedBy =
      !vendor || vendor === "Unassigned" || vendor === "Unknown vendor" ? "" : vendor;
    lines.push(
      [
        csvCell(row.jobName),
        csvCell(formatPoNumberDisplay(row.poNumber, row.poSuffix)),
        csvCell(row.title ?? ""),
        csvCell(formatPoStatusLabel(row.status)),
        csvCell(formatWorkStatusLabel(row.workStatus)),
        csvCell(performedBy),
        csvCell(formatDate(new Date(row.createdAt))),
        csvCell(formatMoney(row.totalCents)),
      ].join(","),
    );
  }
  return `${lines.join("\n")}\n`;
}

export function downloadPurchaseOrdersCsv(
  rows: readonly PoExportRow[],
  fileName = "purchase-orders.csv",
): void {
  const csv = purchaseOrdersToCsv(rows);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}
