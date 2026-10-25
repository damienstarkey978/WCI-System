"use client";

import Link from "next/link";

import { DataGrid, type DataGridColumn } from "@/components/shell/DataGrid";
import { formatDate, formatMoney } from "@/lib/format";

import { PO_STATUS_STYLE, WORK_STATUS_STYLE } from "./status-styles";

export interface PurchaseOrderRow {
  readonly id: string;
  readonly jobId: string;
  readonly poNumber: string;
  readonly poSuffix: string | null;
  readonly title: string | null;
  readonly vendorName: string;
  readonly status: string;
  readonly workStatus: string;
  readonly createdAt: string;
  readonly totalCents: number;
}

/**
 * The client half of the Purchase Orders page — DataGrid's column `render`
 * callbacks are plain functions, which can't cross the server/client
 * component boundary as props, so the server page.tsx shapes the rows into
 * plain data and hands them to this "use client" wrapper to actually render.
 */
export function PurchaseOrdersGrid({ rows }: { rows: readonly PurchaseOrderRow[] }) {
  const columns: DataGridColumn<PurchaseOrderRow>[] = [
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
    { key: "title", header: "Title", render: (row) => row.title ?? "—" },
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

  return <DataGrid columns={columns} rows={rows} rowKey={(row) => row.id} viewKey="purchase-orders" selectable showTotals emptyMessage="No purchase orders yet." />;
}
