"use client";

import Link from "next/link";

import { DataGrid, type DataGridColumn } from "@/components/shell/DataGrid";
import { displayBillNumber } from "@/lib/bills/bill-number";
import { formatDateUtc, formatMoney } from "@/lib/format";

import { SyncToQuickBooksButton } from "./sync-to-quickbooks-button";

/** Buildertrend-style status chip colors — distinct hues, not a teal wash. */
const STATUS_STYLE: Record<string, { bg: string; text: string }> = {
  INBOX: { bg: "#e5e7eb", text: "#374151" },
  IN_REVIEW: { bg: "#fef3c7", text: "#b45309" },
  APPROVED: { bg: "#dbeafe", text: "#1d4ed8" },
  READY_FOR_PAYMENT: { bg: "#ede9fe", text: "#6d28d9" },
  PAID: { bg: "#dcfce7", text: "#15803d" },
  VOID: { bg: "#fee2e2", text: "#b91c1c" },
};

export interface BillRow {
  readonly id: string;
  readonly jobId: string;
  readonly jobName: string;
  readonly title: string | null;
  readonly billNumber: string | null;
  readonly vendorName: string;
  readonly fromOcr: boolean;
  readonly poId: string | null;
  readonly poNumber: string | null;
  readonly poTitle: string | null;
  readonly createdByName: string | null;
  readonly approvalStatus: string;
  readonly dateLabel: string;
  readonly totalCents: number;
  readonly qboBillId: string | null;
  readonly sendToQuickBooks: boolean | null;
}

/**
 * Buildertrend Bills Standard View: Job, Created by, Bill #, Bill title,
 * Pay to, Bill amount, Invoice date. PO / Status / QuickBooks stay available
 * via the Standard view chooser.
 */
const DEFAULT_HIDDEN = ["po", "status", "qbo"] as const;

/** Link blue sampled from BT Bills list (#1F4ECD), not WCI teal. */
const BT_LINK = "#1F4ECD";

/** The client half of the Bills page — see purchase-orders-grid.tsx's doc comment for why this split exists. */
export function BillsGrid({ rows, isQboConnected }: { rows: readonly BillRow[]; isQboConnected: boolean }) {
  const amountTotal = formatMoney(rows.reduce((sum, row) => sum + row.totalCents, 0));
  const columns: DataGridColumn<BillRow>[] = [
    {
      key: "job",
      header: "Job",
      sortable: true,
      sortValue: (row) => row.jobName,
      render: (row) => <span className="text-[var(--bt-muted)]">{row.jobName}</span>,
    },
    {
      key: "createdBy",
      header: "Created by",
      render: (row) => <span className="text-[var(--bt-muted)]">{row.createdByName ?? "—"}</span>,
    },
    {
      key: "billNumber",
      header: "Bill #",
      sortable: true,
      sortValue: (row) => displayBillNumber(row.billNumber) ?? row.billNumber ?? "",
      render: (row) => (
        <Link href={`/jobs/${row.jobId}/bills/${row.id}`} className="font-medium hover:underline" style={{ color: BT_LINK }}>
          {displayBillNumber(row.billNumber) ?? "—"}
        </Link>
      ),
    },
    {
      key: "title",
      header: "Bill title",
      render: (row) => (
        <>
          <Link href={`/jobs/${row.jobId}/bills/${row.id}`} className="hover:underline" style={{ color: BT_LINK }}>
            {row.title ?? row.vendorName}
          </Link>
          {row.fromOcr ? (
            <span className="ml-1.5 rounded px-1 py-0.5 text-[10px] font-semibold" style={{ background: "#ede9fe", color: "#6d28d9" }}>
              AI
            </span>
          ) : null}
        </>
      ),
    },
    {
      key: "vendorName",
      header: "Pay to",
      sortable: true,
      render: (row) => <span className="text-[var(--bt-text)]">{row.vendorName}</span>,
    },
    {
      key: "totalCents",
      header: "Bill amount",
      align: "right",
      sortable: true,
      render: (row) => <span className="tabular-nums">{formatMoney(row.totalCents)}</span>,
      total: <span className="tabular-nums">{amountTotal}</span>,
    },
    {
      key: "date",
      header: "Invoice date",
      align: "right",
      sortable: true,
      sortValue: (row) => row.dateLabel,
      render: (row) => <span className="tabular-nums text-[var(--bt-muted)]">{formatDateUtc(new Date(row.dateLabel))}</span>,
    },
    {
      key: "po",
      header: "PO",
      render: (row) =>
        row.poId ? (
          <Link href={`/jobs/${row.jobId}/purchase-orders/${row.poId}`} className="hover:underline" style={{ color: BT_LINK }}>
            {row.poNumber}
            {row.poTitle ? ` — ${row.poTitle}` : ""}
          </Link>
        ) : (
          <span className="text-[var(--bt-muted)]">—</span>
        ),
    },
    {
      key: "status",
      header: "Status",
      render: (row) => {
        const style = STATUS_STYLE[row.approvalStatus] ?? STATUS_STYLE.IN_REVIEW;
        return (
          <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: style.bg, color: style.text }}>
            {row.approvalStatus.replace(/_/g, " ")}
          </span>
        );
      },
    },
    ...(isQboConnected
      ? [
          {
            key: "qbo",
            header: "QuickBooks",
            align: "right" as const,
            render: (row: BillRow) => {
              if (row.qboBillId) {
                return (
                  <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: "#dcfce7", color: "#15803d" }}>
                    Synced
                  </span>
                );
              }
              if (row.sendToQuickBooks === false) {
                return <span className="text-xs text-[var(--bt-muted)]">Skipped</span>;
              }
              // Sync control stays in product for cutover; live push still gated by
              // QBO_BILL_PUSH_ENABLED (paused while Buildertrend owns QuickBooks).
              return <SyncToQuickBooksButton jobId={row.jobId} billId={row.id} label="Sync" />;
            },
          },
        ]
      : []),
  ];

  return (
    <DataGrid
      columns={columns}
      rows={rows}
      rowKey={(row) => row.id}
      viewKey="bills-bt-standard"
      defaultHiddenKeys={isQboConnected ? [...DEFAULT_HIDDEN] : DEFAULT_HIDDEN.filter((key) => key !== "qbo")}
      selectable
      showTotals
      sortToolbarInFooter
      pageSize={100}
      emptyMessage="No bills yet."
    />
  );
}
