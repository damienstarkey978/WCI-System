"use client";

import Link from "next/link";

import { DataGrid, type DataGridColumn } from "@/components/shell/DataGrid";
import { formatDate, formatMoney } from "@/lib/format";

import { approveChangeOrderAction, declineChangeOrderAction, markChangeOrderSentAction } from "./actions";

const STATUS_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  DRAFT: { bg: "#e5e7eb", text: "#374151", label: "Draft" },
  PENDING_APPROVAL: { bg: "color-mix(in srgb, var(--bt-hazard) 14%, transparent)", text: "var(--bt-hazard)", label: "Sent / Pending" },
  APPROVED: { bg: "var(--bt-status-open-bg)", text: "var(--bt-status-open-text)", label: "Approved" },
  DECLINED: { bg: "color-mix(in srgb, var(--bt-danger) 14%, transparent)", text: "var(--bt-danger)", label: "Declined" },
};

export interface ChangeOrderRow {
  readonly id: string;
  readonly jobId: string;
  readonly number: number;
  readonly title: string;
  readonly mode: string;
  readonly status: string;
  readonly createdAt: string;
  readonly statusChangedAt: string;
  readonly deadline: string | null;
  readonly builderCostCents: number;
  readonly clientPriceCents: number;
  readonly pastDue: boolean;
}

function formatCoNumber(n: number): string {
  return String(n).padStart(4, "0");
}

/** Client half of the Change Orders page; see purchase-orders-grid.tsx for why the split exists. */
export function ChangeOrdersGrid({ rows }: { rows: readonly ChangeOrderRow[] }) {
  const columns: DataGridColumn<ChangeOrderRow>[] = [
    {
      key: "number",
      header: "CO #",
      sortable: true,
      render: (row) => (
        <Link href={`/jobs/${row.jobId}/change-orders/${row.id}`} className="font-medium text-[var(--bt-primary)] hover:underline">
          {formatCoNumber(row.number)}
        </Link>
      ),
    },
    {
      key: "title",
      header: "Title",
      sortable: true,
      render: (row) => (
        <Link href={`/jobs/${row.jobId}/change-orders/${row.id}`} className="font-medium hover:underline">
          {row.title}
        </Link>
      ),
    },
    { key: "createdAt", header: "Created", sortable: true, render: (row) => formatDate(new Date(row.createdAt)) },
    {
      key: "builderCostCents",
      header: "Builder cost",
      align: "right",
      sortable: true,
      render: (row) => formatMoney(row.builderCostCents),
      total: formatMoney(rows.reduce((sum, row) => sum + row.builderCostCents, 0)),
    },
    {
      key: "clientPriceCents",
      header: "Total price",
      align: "right",
      sortable: true,
      render: (row) => formatMoney(row.clientPriceCents),
      total: formatMoney(rows.reduce((sum, row) => sum + row.clientPriceCents, 0)),
    },
    {
      key: "status",
      header: "Status",
      render: (row) => {
        const style = STATUS_STYLE[row.status] ?? STATUS_STYLE.DRAFT;
        const label = row.pastDue && row.status === "PENDING_APPROVAL" ? "Past due" : style.label;
        return (
          <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: style.bg, color: style.text }}>
            {label}
          </span>
        );
      },
    },
    {
      key: "statusChangedAt",
      header: "Status changed",
      sortable: true,
      render: (row) => formatDate(new Date(row.statusChangedAt)),
    },
  ];

  return (
    <DataGrid
      columns={columns}
      rows={rows}
      rowKey={(row) => row.id}
      viewKey="change-orders"
      selectable
      showTotals
      rowActions={(row) =>
        row.status === "DRAFT" || row.status === "PENDING_APPROVAL" ? (
          <div className="flex justify-end gap-3">
            {row.status === "DRAFT" ? (
              <form action={markChangeOrderSentAction}>
                <input type="hidden" name="jobId" value={row.jobId} />
                <input type="hidden" name="changeOrderId" value={row.id} />
                <button type="submit" className="text-xs font-medium text-[var(--bt-primary)] hover:underline" title="Marks as sent/pending. Does not email.">
                  Mark sent
                </button>
              </form>
            ) : null}
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
