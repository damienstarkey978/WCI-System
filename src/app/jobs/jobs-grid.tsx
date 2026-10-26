"use client";

import Link from "next/link";

import { DataGrid, type DataGridColumn } from "@/components/shell/DataGrid";
import { formatDate } from "@/lib/format";

const STATUS_LABEL: Record<string, string> = {
  PRE_SALE: "Pre-Construction",
  OPEN: "In Progress",
  WARRANTY: "Warranty",
  CLOSED: "Closed",
};

const STATUS_STYLE: Record<string, { bg: string; text: string }> = {
  PRE_SALE: { bg: "color-mix(in srgb, var(--bt-primary) 14%, transparent)", text: "var(--bt-primary)" },
  OPEN: { bg: "var(--bt-status-open-bg)", text: "var(--bt-status-open-text)" },
  WARRANTY: { bg: "color-mix(in srgb, var(--bt-hazard) 14%, transparent)", text: "var(--bt-hazard)" },
  CLOSED: { bg: "#e5e7eb", text: "#374151" },
};

/** Buildertrend Jobs Standard View highlights Name, Status, dates, Customer, Address. */
const DEFAULT_HIDDEN = ["groupName", "contractType"] as const;

export interface JobRow {
  readonly id: string;
  readonly name: string;
  readonly prefix: string | null;
  readonly status: string;
  readonly groupName: string;
  readonly customerName: string | null;
  readonly address: string | null;
  readonly contractType: string;
  readonly projectedStart: string | null;
  readonly projectedEnd: string | null;
  readonly qboLinked: boolean;
}

/** Client half of the Jobs list; see purchase-orders-grid.tsx for why the split exists. */
export function JobsGrid({ rows }: { rows: readonly JobRow[] }) {
  const columns: DataGridColumn<JobRow>[] = [
    {
      key: "name",
      header: "Name",
      sortable: true,
      render: (row) => (
        <Link href={`/jobs/${row.id}/settings`} className="inline-flex items-center gap-1.5 font-medium text-[var(--bt-primary)] hover:underline">
          {row.prefix ? <span className="font-mono text-xs text-[var(--bt-muted)]">{row.prefix}</span> : null}
          <span>{row.name}</span>
          {row.qboLinked ? (
            <span className="rounded bg-[#2ca01c]/15 px-1 py-0.5 text-[9px] font-bold text-[#2ca01c]" title="Linked to QuickBooks">
              QB
            </span>
          ) : null}
        </Link>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (row) => {
        const style = STATUS_STYLE[row.status] ?? STATUS_STYLE.OPEN;
        return (
          <span className="rounded px-1.5 py-0.5 text-xs font-semibold" style={{ background: style.bg, color: style.text }}>
            {STATUS_LABEL[row.status] ?? row.status}
          </span>
        );
      },
    },
    {
      key: "projectedStart",
      header: "Start Date",
      sortable: true,
      render: (row) => (row.projectedStart ? formatDate(new Date(row.projectedStart)) : ""),
    },
    {
      key: "projectedEnd",
      header: "End Date",
      sortable: true,
      render: (row) => (row.projectedEnd ? formatDate(new Date(row.projectedEnd)) : ""),
    },
    { key: "customer", header: "Customer", render: (row) => row.customerName ?? "" },
    { key: "address", header: "Address", render: (row) => row.address ?? "" },
    { key: "groupName", header: "Job group", render: (row) => row.groupName },
    { key: "contractType", header: "Job Type", render: (row) => (row.contractType === "OPEN_BOOK" ? "Open book" : "Fixed price") },
  ];

  return (
    <DataGrid
      columns={columns}
      rows={rows}
      rowKey={(row) => row.id}
      viewKey="jobs"
      defaultHiddenKeys={DEFAULT_HIDDEN}
      selectable
      emptyMessage="No jobs yet. Create one with the button above."
    />
  );
}
