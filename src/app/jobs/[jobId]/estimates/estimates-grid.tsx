"use client";

import Link from "next/link";

import { DataGrid, type DataGridColumn } from "@/components/shell/DataGrid";
import { formatDate, formatMoney } from "@/lib/format";

import { SaveAsTemplateForm } from "./save-as-template-form";

const STATUS_STYLE: Record<string, { bg: string; text: string }> = {
  DRAFT: { bg: "#e5e7eb", text: "#374151" },
  SENT: { bg: "color-mix(in srgb, var(--bt-primary) 14%, transparent)", text: "var(--bt-primary)" },
  ACCEPTED: { bg: "var(--bt-status-open-bg)", text: "var(--bt-status-open-text)" },
  DECLINED: { bg: "color-mix(in srgb, var(--bt-danger) 14%, transparent)", text: "var(--bt-danger)" },
};

export interface EstimateRow {
  readonly id: string;
  readonly jobId: string;
  readonly title: string;
  readonly status: string;
  readonly createdAt: string;
  readonly clientPriceCents: number;
}

/** Client half of the Estimates page; see purchase-orders-grid.tsx for why the split exists. */
export function EstimatesGrid({ rows }: { rows: readonly EstimateRow[] }) {
  const columns: DataGridColumn<EstimateRow>[] = [
    { key: "title", header: "Title", sortable: true, render: (row) => (
        <Link href={`/jobs/${row.jobId}/estimates/${row.id}`} className="font-medium text-[var(--bt-primary)] hover:underline">
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
      key: "clientPriceCents",
      header: "Client price",
      align: "right",
      sortable: true,
      render: (row) => formatMoney(row.clientPriceCents),
      total: formatMoney(rows.reduce((sum, row) => sum + row.clientPriceCents, 0)),
    },
  ];

  return (
    <DataGrid
      columns={columns}
      rows={rows}
      rowKey={(row) => row.id} viewKey="estimates"
      selectable
      showTotals
      rowActions={(row) => <SaveAsTemplateForm jobId={row.jobId} estimateId={row.id} />}
      emptyMessage="No estimates yet."
    />
  );
}
