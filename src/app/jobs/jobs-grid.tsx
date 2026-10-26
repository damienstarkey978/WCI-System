"use client";

import Link from "next/link";

import { DataGrid, type DataGridColumn } from "@/components/shell/DataGrid";
import { formatDate } from "@/lib/format";

const STATUS_LABEL: Record<string, string> = {
  PRE_SALE: "Pre-sale",
  OPEN: "Open",
  WARRANTY: "Warranty",
  CLOSED: "Closed",
};

export interface JobRow {
  readonly id: string;
  readonly name: string;
  readonly prefix: string | null;
  readonly status: string;
  readonly groupName: string;
  readonly address: string | null;
  readonly contractType: string;
  readonly projectedStart: string | null;
  readonly projectedEnd: string | null;
}

/** Client half of the Jobs list; see purchase-orders-grid.tsx for why the split exists. */
export function JobsGrid({ rows }: { rows: readonly JobRow[] }) {
  const columns: DataGridColumn<JobRow>[] = [
    {
      key: "name",
      header: "Job",
      sortable: true,
      render: (row) => (
        <Link href={`/jobs/${row.id}/settings`} className="font-medium text-[var(--bt-primary)] hover:underline">
          {row.prefix ? <span className="mr-1.5 font-mono text-xs text-[var(--bt-muted)]">{row.prefix}</span> : null}
          {row.name}
        </Link>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (row) => (
        <span className="rounded px-1.5 py-0.5 text-xs font-semibold" style={{ background: "var(--bt-status-open-bg)", color: "var(--bt-status-open-text)" }}>
          {STATUS_LABEL[row.status] ?? row.status}
        </span>
      ),
    },
    { key: "groupName", header: "Job group", render: (row) => row.groupName },
    { key: "address", header: "Address", render: (row) => row.address ?? "" },
    { key: "contractType", header: "Contract type", render: (row) => (row.contractType === "OPEN_BOOK" ? "Open book" : "Fixed price") },
    { key: "projectedStart", header: "Projected start", sortable: true, render: (row) => (row.projectedStart ? formatDate(new Date(row.projectedStart)) : "") },
    { key: "projectedEnd", header: "Projected end", sortable: true, render: (row) => (row.projectedEnd ? formatDate(new Date(row.projectedEnd)) : "") },
  ];

  return <DataGrid columns={columns} rows={rows} rowKey={(row) => row.id} viewKey="jobs" selectable emptyMessage="No jobs yet. Create one with the button above." />;
}
