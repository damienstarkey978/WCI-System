"use client";

import Link from "next/link";

import { DataGrid, type DataGridColumn } from "@/components/shell/DataGrid";
import { formatDate, formatMoney } from "@/lib/format";

export interface CostInboxRow {
  readonly id: string;
  readonly jobId: string;
  readonly jobName: string;
  readonly title: string;
  readonly statusLabel: string;
  readonly purchaseDate: string;
  readonly totalCents: number;
}

export function CostInboxGrid({ rows }: { rows: readonly CostInboxRow[] }) {
  const columns: DataGridColumn<CostInboxRow>[] = [
    {
      key: "title",
      header: "Title",
      sortable: true,
      render: (row) => (
        <Link href={`/jobs/${row.jobId}/bills/${row.id}`} className="font-medium hover:underline" style={{ color: "var(--bt-primary)" }}>
          {row.title}
        </Link>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (row) => (
        <span
          className="rounded px-1.5 py-0.5 text-[10px] font-semibold"
          style={{ background: "var(--bt-status-open-bg)", color: "var(--bt-status-open-text)" }}
        >
          {row.statusLabel}
        </span>
      ),
    },
    {
      key: "purchaseDate",
      header: "Purchase Date",
      sortable: true,
      render: (row) => formatDate(new Date(row.purchaseDate)),
    },
    {
      key: "job",
      header: "Job",
      sortable: true,
      sortValue: (row) => row.jobName,
      render: (row) => <span className="text-[var(--bt-muted)]">{row.jobName}</span>,
    },
    {
      key: "totalCents",
      header: "Amount",
      align: "right",
      sortable: true,
      render: (row) => formatMoney(row.totalCents),
      total: formatMoney(rows.reduce((sum, row) => sum + row.totalCents, 0)),
    },
  ];

  return (
    <DataGrid
      columns={columns}
      rows={rows}
      rowKey={(row) => row.id}
      viewKey="cost-inbox"
      defaultHiddenKeys={["totalCents"]}
      selectable
      showTotals
      emptyMessage="Inbox is clear."
    />
  );
}
