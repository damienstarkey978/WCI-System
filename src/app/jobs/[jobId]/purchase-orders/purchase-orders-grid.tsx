"use client";

import Link from "next/link";

import { DataGrid, type DataGridColumn } from "@/components/shell/DataGrid";
import { PencilIcon } from "@/components/shell/icons";
import { formatDate, formatMoney } from "@/lib/format";

import { PO_STATUS_STYLE, WORK_STATUS_STYLE } from "./status-styles";

export interface PurchaseOrderRow {
  readonly id: string;
  readonly jobId: string;
  readonly jobName: string;
  readonly poNumber: string;
  readonly poSuffix: string | null;
  readonly title: string | null;
  readonly vendorName: string;
  readonly status: string;
  readonly workStatus: string;
  readonly createdAt: string;
  readonly totalCents: number;
}

/** Buildertrend's Purchase Orders Standard View: Job, PO #, Title (+ edit action). */
const DEFAULT_HIDDEN = ["vendorName", "status", "workStatus", "createdAt", "totalCents"] as const;

/**
 * The client half of the Purchase Orders page — DataGrid's column `render`
 * callbacks are plain functions, which can't cross the server/client
 * component boundary as props, so the server page.tsx shapes the rows into
 * plain data and hands them to this "use client" wrapper to actually render.
 */
export function PurchaseOrdersGrid({ rows }: { rows: readonly PurchaseOrderRow[] }) {
  const columns: DataGridColumn<PurchaseOrderRow>[] = [
    {
      key: "job",
      header: "Job",
      sortable: true,
      sortValue: (row) => row.jobName,
      render: (row) => <span className="text-[var(--bt-muted)]">{row.jobName}</span>,
    },
    {
      key: "poNumber",
      header: "PO #",
      sortable: true,
      render: (row) => (
        <Link href={`/jobs/${row.jobId}/purchase-orders/${row.id}`} className="font-medium hover:underline" style={{ color: "var(--bt-primary)" }}>
          {row.poNumber}
          {row.poSuffix ? `-${row.poSuffix}` : ""}
        </Link>
      ),
    },
    {
      key: "title",
      header: "Title",
      sortable: true,
      render: (row) => (
        <Link href={`/jobs/${row.jobId}/purchase-orders/${row.id}`} className="hover:underline" style={{ color: "var(--bt-primary)" }}>
          {row.title ?? "—"}
        </Link>
      ),
    },
    { key: "vendorName", header: "Performed by", sortable: true, render: (row) => row.vendorName },
    {
      key: "status",
      header: "PO status",
      render: (row) => {
        const style = PO_STATUS_STYLE[row.status] ?? PO_STATUS_STYLE.DRAFT;
        return (
          <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: style.bg, color: style.text }}>
            {row.status.replace(/_/g, " ")}
          </span>
        );
      },
    },
    {
      key: "workStatus",
      header: "Work status",
      render: (row) => {
        const style = WORK_STATUS_STYLE[row.workStatus];
        return (
          <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: style.bg, color: style.text }}>
            {row.workStatus.replace(/_/g, " ")}
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
      render: (row) => formatMoney(row.totalCents),
      total: formatMoney(rows.reduce((sum, row) => sum + row.totalCents, 0)),
    },
  ];

  return (
    <DataGrid
      columns={columns}
      rows={rows}
      rowKey={(row) => row.id}
      viewKey="purchase-orders"
      defaultHiddenKeys={DEFAULT_HIDDEN}
      selectable
      showTotals
      rowActions={(row) => (
        <Link
          href={`/jobs/${row.jobId}/purchase-orders/${row.id}`}
          aria-label={`Edit purchase order ${row.poNumber}`}
          className="inline-flex rounded p-1 text-[var(--bt-muted)] hover:bg-black/5 hover:text-[var(--bt-primary)]"
        >
          <PencilIcon className="h-4 w-4" />
        </Link>
      )}
      emptyMessage="No purchase orders yet."
    />
  );
}
