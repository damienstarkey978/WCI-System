"use client";

import { DataGrid, type DataGridColumn } from "@/components/shell/DataGrid";
import { formatDate, formatMoney } from "@/lib/format";

export interface SelectionRow {
  readonly id: string;
  readonly title: string;
  readonly allowanceTitle: string | null;
  readonly dueDate: string | null;
  readonly status: "Pending" | "Approved" | "Declined";
  readonly optionCount: number;
  readonly approvedPriceCents: number | null;
}

export interface AllowanceRow {
  readonly id: string;
  readonly title: string;
  readonly costCode: string;
  readonly amountCents: number;
  readonly clientPriceCents: number;
  readonly selectionCount: number;
}

const STATUS_STYLE: Record<string, { bg: string; text: string }> = {
  Pending: { bg: "#e5e7eb", text: "#374151" },
  Approved: { bg: "var(--bt-status-open-bg)", text: "var(--bt-status-open-text)" },
  Declined: { bg: "color-mix(in srgb, var(--bt-danger) 14%, transparent)", text: "var(--bt-danger)" },
};

/** Client halves of the Selections list/allowances views; see purchase-orders-grid.tsx for why the split exists. */
export function SelectionsListGrid({ rows }: { rows: readonly SelectionRow[] }) {
  const columns: DataGridColumn<SelectionRow>[] = [
    { key: "title", header: "Title", sortable: true, render: (row) => <span className="font-medium">{row.title}</span> },
    { key: "allowance", header: "Allowance", render: (row) => row.allowanceTitle ?? "" },
    { key: "dueDate", header: "Due", sortable: true, render: (row) => (row.dueDate ? formatDate(new Date(row.dueDate)) : "") },
    { key: "options", header: "Options", align: "right", render: (row) => row.optionCount },
    {
      key: "status",
      header: "Status",
      render: (row) => (
        <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: STATUS_STYLE[row.status].bg, color: STATUS_STYLE[row.status].text }}>
          {row.status.toUpperCase()}
        </span>
      ),
    },
    {
      key: "approvedPrice",
      header: "Approved price",
      align: "right",
      render: (row) => (row.approvedPriceCents !== null ? formatMoney(row.approvedPriceCents) : ""),
      total: formatMoney(rows.reduce((sum, row) => sum + (row.approvedPriceCents ?? 0), 0)),
    },
  ];
  return <DataGrid columns={columns} rows={rows} rowKey={(row) => row.id} selectable showTotals emptyMessage="No selections yet." />;
}

export function AllowancesGrid({ rows }: { rows: readonly AllowanceRow[] }) {
  const columns: DataGridColumn<AllowanceRow>[] = [
    { key: "title", header: "Allowance", sortable: true, render: (row) => <span className="font-medium">{row.title}</span> },
    { key: "costCode", header: "Cost code", render: (row) => row.costCode },
    {
      key: "amount",
      header: "Builder cost",
      align: "right",
      render: (row) => formatMoney(row.amountCents),
      total: formatMoney(rows.reduce((sum, row) => sum + row.amountCents, 0)),
    },
    {
      key: "clientPrice",
      header: "Client price",
      align: "right",
      render: (row) => formatMoney(row.clientPriceCents),
      total: formatMoney(rows.reduce((sum, row) => sum + row.clientPriceCents, 0)),
    },
    { key: "selections", header: "Selections", align: "right", render: (row) => row.selectionCount },
  ];
  return <DataGrid columns={columns} rows={rows} rowKey={(row) => row.id} selectable showTotals emptyMessage="No allowances yet." />;
}
