"use client";

import Link from "next/link";

import { DataGrid, type DataGridColumn } from "@/components/shell/DataGrid";
import { formatDate, formatDateUtc } from "@/lib/format";

import { closeRfiAction } from "./actions";

const STATUS_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  OPEN: { bg: "color-mix(in srgb, var(--bt-hazard) 14%, transparent)", text: "var(--bt-hazard)", label: "Open" },
  ANSWERED: { bg: "color-mix(in srgb, var(--bt-primary) 14%, transparent)", text: "var(--bt-primary)", label: "Answered" },
  CLOSED: { bg: "#e5e7eb", text: "#374151", label: "Closed" },
};

export interface RfiRow {
  readonly id: string;
  readonly jobId: string;
  readonly number: number;
  readonly title: string;
  readonly status: string;
  readonly dueDate: string | null;
  readonly createdAt: string;
  readonly assignee: string | null;
}

function formatRfiNumber(n: number): string {
  return String(n).padStart(4, "0");
}

export function RfisGrid({ rows }: { rows: readonly RfiRow[] }) {
  const columns: DataGridColumn<RfiRow>[] = [
    {
      key: "number",
      header: "ID #",
      sortable: true,
      render: (row) => (
        <Link href={`/jobs/${row.jobId}/rfis/${row.id}`} className="font-medium text-[var(--bt-primary)] hover:underline">
          {formatRfiNumber(row.number)}
        </Link>
      ),
    },
    {
      key: "title",
      header: "Title",
      sortable: true,
      render: (row) => (
        <Link href={`/jobs/${row.jobId}/rfis/${row.id}`} className="font-medium hover:underline">
          {row.title}
        </Link>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (row) => {
        const style = STATUS_STYLE[row.status] ?? STATUS_STYLE.OPEN;
        return (
          <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: style.bg, color: style.text }}>
            {style.label}
          </span>
        );
      },
    },
    { key: "assignee", header: "Assignee", render: (row) => row.assignee ?? "" },
    {
      key: "dueDate",
      header: "Due date",
      sortable: true,
      render: (row) => (row.dueDate ? formatDateUtc(new Date(row.dueDate)) : ""),
    },
    {
      key: "createdAt",
      header: "Created",
      sortable: true,
      render: (row) => formatDate(new Date(row.createdAt)),
    },
  ];

  return (
    <DataGrid
      columns={columns}
      rows={rows}
      rowKey={(row) => row.id}
      viewKey="rfis"
      selectable
      rowActions={(row) =>
        row.status !== "CLOSED" ? (
          <form action={closeRfiAction}>
            <input type="hidden" name="jobId" value={row.jobId} />
            <input type="hidden" name="rfiId" value={row.id} />
            <button type="submit" className="text-xs text-[var(--bt-muted)] hover:text-red-600 hover:underline">
              Close
            </button>
          </form>
        ) : null
      }
      emptyMessage="No RFIs yet."
    />
  );
}
