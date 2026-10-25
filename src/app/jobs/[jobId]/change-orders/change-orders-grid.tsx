"use client";

import { DataGrid, type DataGridColumn } from "@/components/shell/DataGrid";
import { formatDate, formatMoney } from "@/lib/format";

import { approveChangeOrderAction, declineChangeOrderAction } from "./actions";

const STATUS_STYLE: Record<string, { bg: string; text: string }> = {
  DRAFT: { bg: "#e5e7eb", text: "#374151" },
  PENDING_APPROVAL: { bg: "color-mix(in srgb, var(--bt-hazard) 14%, transparent)", text: "var(--bt-hazard)" },
  APPROVED: { bg: "var(--bt-status-open-bg)", text: "var(--bt-status-open-text)" },
  DECLINED: { bg: "color-mix(in srgb, var(--bt-danger) 14%, transparent)", text: "var(--bt-danger)" },
};

export interface ChangeOrderRow {
  readonly id: string;
  readonly jobId: string;
  readonly title: string;
  readonly mode: string;
  readonly status: string;
  readonly createdAt: string;
  readonly clientPriceCents: number;
}

/** Client half of the Change Orders page; see purchase-orders-grid.tsx for why the split exists. */
export function ChangeOrdersGrid({ rows }: { rows: readonly ChangeOrderRow[] }) {
  const columns: DataGridColumn<ChangeOrderRow>[] = [
    { key: "title", header: "Title", sortable: true, render: (row) => <span className="font-medium">{row.title}</span> },
    { key: "mode", header: "Type", render: (row) => (row.mode === "FLAT" ? "Flat" : "Itemized") },
    {
      key: "status",
      header: "Status",
      render: (row) => {
        const style = STATUS_STYLE[row.status] ?? STATUS_STYLE.DRAFT;
        return (
          <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: style.bg, color: style.text }}>
            {row.status.replace(/_/g, " ")}
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
      rowKey={(row) => row.id}
      selectable
      showTotals
      rowActions={(row) =>
        row.status === "DRAFT" || row.status === "PENDING_APPROVAL" ? (
          <div className="flex justify-end gap-3">
            <form action={approveChangeOrderAction}>
              <input type="hidden" name="jobId" value={row.jobId} />
              <input type="hidden" name="changeOrderId" value={row.id} />
              <button type="submit" className="text-xs font-medium text-[var(--bt-primary)] hover:underline">
                Approve
              </button>
            </form>
            <form action={declineChangeOrderAction}>
              <input type="hidden" name="jobId" value={row.jobId} />
              <input type="hidden" name="changeOrderId" value={row.id} />
              <button type="submit" className="text-xs text-[var(--bt-muted)] hover:text-red-600 hover:underline">
                Decline
              </button>
            </form>
          </div>
        ) : null
      }
      emptyMessage="No change orders yet."
    />
  );
}
