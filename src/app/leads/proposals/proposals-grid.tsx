"use client";

import Link from "next/link";

import { DataGrid, type DataGridColumn } from "@/components/shell/DataGrid";
import { formatDate, formatMoney } from "@/lib/format";

const STATUS_STYLE: Record<string, { bg: string; text: string }> = {
  DRAFT: { bg: "#e5e7eb", text: "#374151" },
  SENT: { bg: "color-mix(in srgb, var(--bt-primary) 14%, transparent)", text: "var(--bt-primary)" },
  ACCEPTED: { bg: "var(--bt-status-open-bg)", text: "var(--bt-status-open-text)" },
  DECLINED: { bg: "color-mix(in srgb, var(--bt-danger) 14%, transparent)", text: "var(--bt-danger)" },
};

export interface LeadProposalRow {
  readonly id: string;
  readonly leadId: string | null;
  readonly leadName: string | null;
  readonly title: string;
  readonly status: string;
  readonly createdAt: string;
  /** Single price, or the low end when several options are still being compared. */
  readonly totalCents: number;
  /** Set when options span a range and none is selected yet. */
  readonly totalMaxCents: number | null;
}

/** Client half of the Lead Proposals list; see purchase-orders-grid.tsx for why the split exists. */
export function LeadProposalsGrid({ rows }: { rows: readonly LeadProposalRow[] }) {
  const columns: DataGridColumn<LeadProposalRow>[] = [
    {
      key: "leadName",
      header: "Lead",
      sortable: true,
      render: (row) =>
        row.leadId ? (
          <Link href={`/leads/${row.leadId}?tab=proposals`} className="font-medium text-[var(--bt-primary)] hover:underline">
            {row.leadName}
          </Link>
        ) : (
          ""
        ),
    },
    {
      key: "title",
      header: "Title",
      sortable: true,
      render: (row) => (
        <Link href={`/leads/proposals/${row.id}`} className="font-medium text-[var(--bt-text)] hover:underline">
          {row.title}
        </Link>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (row) => {
        const style = STATUS_STYLE[row.status] ?? STATUS_STYLE.DRAFT;
        return (
          <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: style.bg, color: style.text }}>
            {row.status}
          </span>
        );
      },
    },
    { key: "createdAt", header: "Created", sortable: true, render: (row) => formatDate(new Date(row.createdAt)) },
    {
      key: "totalCents",
      header: "Total",
      align: "right",
      sortable: true,
      render: (row) => (row.totalMaxCents !== null ? `${formatMoney(row.totalCents)} to ${formatMoney(row.totalMaxCents)}` : formatMoney(row.totalCents)),
    },
  ];
  return (
    <DataGrid
      columns={columns}
      rows={rows}
      rowKey={(row) => row.id}
      rowHref={(row) => `/leads/proposals/${row.id}`}
      viewKey="lead-proposals"
      selectable
      emptyMessage="No proposals match."
    />
  );
}
