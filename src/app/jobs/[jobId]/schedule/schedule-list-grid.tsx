"use client";

import { DataGrid, type DataGridColumn } from "@/components/shell/DataGrid";
import { formatDateUtc } from "@/lib/format";

import { EditScheduleItemButton } from "./schedule-item-modals";
import type { PhaseOption, ScheduleItemFormValues, ScheduleItemOption, StaffOption } from "./schedule-item-form";

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
  readonly phaseId: string | null;
  readonly formValues: ScheduleItemFormValues & { id: string };
}

/** Client half of the Schedule list view; see purchase-orders-grid.tsx for why the split exists. */
export function ScheduleListGrid({
  rows,
  phases,
  showPhases,
  jobId,
  scheduleId,
  jobName,
  existingItems,
  staff,
}: {
  rows: readonly ScheduleListRow[];
  phases: readonly PhaseOption[];
  showPhases: boolean;
  jobId: string;
  scheduleId: string;
  jobName: string;
  existingItems: readonly ScheduleItemOption[];
  staff: readonly StaffOption[];
}) {
  const columns: DataGridColumn<ScheduleListRow>[] = [
    {
      key: "title",
      header: "Title",
      sortable: true,
      render: (row) => (
        <EditScheduleItemButton
          jobId={jobId}
          scheduleId={scheduleId}
          jobName={jobName}
          existingItems={existingItems}
          phases={phases}
          staff={staff}
          initial={row.formValues}
        >
          <span className="font-medium text-[var(--bt-primary)]">{row.title}</span>
        </EditScheduleItemButton>
      ),
    },
    { key: "start", header: "Start", sortable: true, sortValue: (row) => row.startDate, render: (row) => formatDateUtc(new Date(row.startDate)) },
    { key: "end", header: "End", sortable: true, sortValue: (row) => row.endDate, render: (row) => formatDateUtc(new Date(row.endDate)) },
    { key: "duration", header: "Duration", align: "right", render: (row) => `${row.durationDays} ${row.durationDays === 1 ? "day" : "days"}` },
    {
      key: "progress",
      header: "Complete",
      align: "right",
      render: (row) => `${Math.round(row.percentComplete)}%`,
    },
    ...(showPhases
      ? [
          {
            key: "phase",
            header: "Phase",
            render: (row: ScheduleListRow) => phases.find((phase) => phase.id === row.phaseId)?.name ?? "Unassigned",
          },
        ]
      : []),
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
  return <DataGrid columns={columns} rows={rows} rowKey={(row) => row.id} selectable viewKey="schedule-list" emptyMessage="No schedule items yet." />;
}
