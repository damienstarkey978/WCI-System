"use client";

import Link from "next/link";

import { DataGrid, type DataGridColumn } from "@/components/shell/DataGrid";
import { formatDate, formatMoney } from "@/lib/format";

import { SyncToQuickBooksButton } from "./sync-to-quickbooks-button";

const STATUS_STYLE: Record<string, { bg: string; text: string }> = {
  INBOX: { bg: "#e5e7eb", text: "#374151" },
  IN_REVIEW: { bg: "color-mix(in srgb, var(--bt-hazard) 14%, transparent)", text: "var(--bt-hazard)" },
  APPROVED: { bg: "color-mix(in srgb, var(--bt-primary) 14%, transparent)", text: "var(--bt-primary)" },
  READY_FOR_PAYMENT: { bg: "color-mix(in srgb, var(--bt-primary) 14%, transparent)", text: "var(--bt-primary)" },
  PAID: { bg: "var(--bt-status-open-bg)", text: "var(--bt-status-open-text)" },
  VOID: { bg: "color-mix(in srgb, var(--bt-danger) 14%, transparent)", text: "var(--bt-danger)" },
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
}

/** Buildertrend's Bills Standard View: Job, Created by, Bill #, Bill title. */
const DEFAULT_HIDDEN = ["vendorName", "po", "status", "date", "totalCents", "qbo"] as const;

/** The client half of the Bills page — see purchase-orders-grid.tsx's doc comment for why this split exists. */
export function BillsGrid({ rows, isQboConnected }: { rows: readonly BillRow[]; isQboConnected: boolean }) {
  const columns: DataGridColumn<BillRow>[] = [
    {
      key: "job",
      header: "Job",
      sortable: true,
      sortValue: (row) => row.jobName,
      render: (row) => <span className="text-[var(--bt-muted)]">{row.jobName}</span>,
    },
    { key: "createdBy", header: "Created by", render: (row) => row.createdByName ?? "—" },
    {
      key: "billNumber",
      header: "Bill #",
      sortable: true,
      render: (row) => (
        <Link href={`/jobs/${row.jobId}/bills/${row.id}`} className="font-medium hover:underline" style={{ color: "var(--bt-primary)" }}>
          {row.billNumber ?? "—"}
        </Link>
      ),
    },
    {
      key: "title",
      header: "Bill title",
      render: (row) => (
        <>
          <Link href={`/jobs/${row.jobId}/bills/${row.id}`} className="hover:underline" style={{ color: "var(--bt-primary)" }}>
            {row.title ?? row.vendorName}
          </Link>
          {row.fromOcr ? <span className="ml-1.5 rounded bg-black/5 px-1 py-0.5 text-[10px] text-[var(--bt-muted)]">AI</span> : null}
        </>
      ),
    },
    { key: "vendorName", header: "Pay to", sortable: true, render: (row) => <span className="font-medium text-[var(--bt-text)]">{row.vendorName}</span> },
    {
      key: "po",
      header: "PO",
      render: (row) =>
        row.poId ? (
          <Link href={`/jobs/${row.jobId}/purchase-orders/${row.poId}`} className="hover:underline" style={{ color: "var(--bt-primary)" }}>
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
    { key: "date", header: "Invoice date", sortable: true, sortValue: (row) => row.dateLabel, render: (row) => formatDate(new Date(row.dateLabel)) },
    {
      key: "totalCents",
      header: "Amount",
      align: "right",
      sortable: true,
      render: (row) => formatMoney(row.totalCents),
      total: formatMoney(rows.reduce((sum, row) => sum + row.totalCents, 0)),
    },
    ...(isQboConnected
      ? [
          {
            key: "qbo",
            header: "QuickBooks",
            align: "right" as const,
            render: (row: BillRow) =>
              row.qboBillId ? <span className="text-xs text-[var(--bt-muted)]">Synced</span> : <SyncToQuickBooksButton jobId={row.jobId} billId={row.id} label="Sync" />,
          },
        ]
      : []),
  ];

  return (
    <DataGrid
      columns={columns}
      rows={rows}
      rowKey={(row) => row.id}
      viewKey="bills"
      defaultHiddenKeys={isQboConnected ? DEFAULT_HIDDEN : DEFAULT_HIDDEN.filter((key) => key !== "qbo")}
      selectable
      showTotals
      emptyMessage="No bills yet."
    />
  );
}
