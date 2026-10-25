"use client";

import { useActionState } from "react";

import { DataGrid, type DataGridColumn } from "@/components/shell/DataGrid";
import { formatDateUtc } from "@/lib/format";

import { setScheduleItemProgressAction, type ActionState } from "./actions";

export interface ScheduleListRow {
  readonly id: string;
  readonly title: string;
  readonly startDate: string;
  readonly endDate: string;
  readonly durationDays: number;
  readonly floatDays: number;
  readonly isCriticalPath: boolean;
  readonly confirmed: boolean;
  readonly jobId: string;
  readonly percentComplete: number;
}

function ProgressCell({ jobId, itemId, percent }: { jobId: string; itemId: string; percent: number }) {
  const [state, formAction, pending] = useActionState(setScheduleItemProgressAction, {} as ActionState);
  return (
    <form action={formAction} className="flex items-center justify-end gap-1">
      <input type="hidden" name="jobId" value={jobId} />
      <input type="hidden" name="itemId" value={itemId} />
      <input
        name="percent"
        type="number"
        min={0}
        max={100}
        defaultValue={percent}
        aria-label="Percent complete"
        className="w-16 rounded border px-1.5 py-1 text-right text-sm"
        style={{ borderColor: "var(--bt-border)" }}
      />
      <span className="text-xs text-[var(--bt-muted)]">%</span>
      <button type="submit" disabled={pending} className="text-xs font-medium text-[var(--bt-primary)] hover:underline disabled:opacity-50">
        {pending ? "…" : "Save"}
      </button>
      {state.error ? <span className="text-xs text-red-600">{state.error}</span> : null}
    </form>
  );
}

/** Client half of the Schedule list view; see purchase-orders-grid.tsx for why the split exists. */
export function ScheduleListGrid({ rows }: { rows: readonly ScheduleListRow[] }) {
  const columns: DataGridColumn<ScheduleListRow>[] = [
    { key: "title", header: "Title", sortable: true, render: (row) => <span className="font-medium">{row.title}</span> },
    { key: "start", header: "Start", sortable: true, render: (row) => formatDateUtc(new Date(row.startDate)) },
    { key: "end", header: "End", sortable: true, render: (row) => formatDateUtc(new Date(row.endDate)) },
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
      key: "progress",
      header: "% complete",
      align: "right",
      render: (row) => <ProgressCell jobId={row.jobId} itemId={row.id} percent={row.percentComplete} />,
    },
    {
      key: "confirmed",
      header: "Confirmation",
      render: (row) => (row.confirmed ? "Confirmed" : <span className="text-[var(--bt-hazard)]">Unconfirmed</span>),
    },
  ];
  return <DataGrid columns={columns} rows={rows} rowKey={(row) => row.id} selectable emptyMessage="No schedule items yet." />;
}
