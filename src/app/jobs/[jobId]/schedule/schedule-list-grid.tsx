"use client";

import { DataGrid, type DataGridColumn } from "@/components/shell/DataGrid";
import { formatDate } from "@/lib/format";

export interface ScheduleListRow {
  readonly id: string;
  readonly title: string;
  readonly startDate: string;
  readonly endDate: string;
  readonly durationDays: number;
  readonly floatDays: number;
  readonly isCriticalPath: boolean;
  readonly confirmed: boolean;
}

/** Client half of the Schedule list view; see purchase-orders-grid.tsx for why the split exists. */
export function ScheduleListGrid({ rows }: { rows: readonly ScheduleListRow[] }) {
  const columns: DataGridColumn<ScheduleListRow>[] = [
    { key: "title", header: "Title", sortable: true, render: (row) => <span className="font-medium">{row.title}</span> },
    { key: "start", header: "Start", sortable: true, render: (row) => formatDate(new Date(row.startDate)) },
    { key: "end", header: "End", sortable: true, render: (row) => formatDate(new Date(row.endDate)) },
    { key: "duration", header: "Duration", align: "right", render: (row) => `${row.durationDays} ${row.durationDays === 1 ? "day" : "days"}` },
    { key: "float", header: "Float", align: "right", render: (row) => `${row.floatDays} ${row.floatDays === 1 ? "day" : "days"}` },
    {
      key: "critical",
      header: "Critical path",
      render: (row) =>
        row.isCriticalPath ? (
          <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: "color-mix(in srgb, var(--bt-danger) 14%, transparent)", color: "var(--bt-danger)" }}>
            CRITICAL
          </span>
        ) : (
          ""
        ),
    },
    {
      key: "confirmed",
      header: "Confirmation",
      render: (row) => (row.confirmed ? "Confirmed" : <span className="text-[var(--bt-hazard)]">Unconfirmed</span>),
    },
  ];
  return <DataGrid columns={columns} rows={rows} rowKey={(row) => row.id} selectable emptyMessage="No schedule items yet." />;
}
