"use client";

import type { ReactNode } from "react";

import { DataGrid, type DataGridColumn } from "@/components/shell/DataGrid";
import { PencilIcon, PlusCircleIcon } from "@/components/shell/icons";
import { formatDateUtc } from "@/lib/format";

import { EditScheduleItemButton, NewScheduleItemButton } from "./schedule-item-modals";
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

/** Client half of the Schedule list view — BT columns: Title / Start / Workdays (+ End / Progress extras in Standard View). */
export function ScheduleListGrid({
  rows,
  phases,
  showPhases,
  criticalPath,
  jobId,
  scheduleId,
  jobName,
  existingItems,
  staff,
}: {
  rows: readonly ScheduleListRow[];
  phases: readonly PhaseOption[];
  showPhases: boolean;
  criticalPath: boolean;
  jobId: string;
  scheduleId: string;
  jobName: string;
  existingItems: readonly ScheduleItemOption[];
  staff: readonly StaffOption[];
}) {
  const actionSlot = (row: ScheduleListRow): ReactNode => (
    <div className="flex items-center justify-end gap-0.5">
      <EditScheduleItemButton
        jobId={jobId}
        scheduleId={scheduleId}
        jobName={jobName}
        existingItems={existingItems}
        phases={phases}
        staff={staff}
        initial={row.formValues}
        className="inline-flex h-7 w-7 items-center justify-center rounded text-[var(--bt-primary)] hover:bg-[color-mix(in_srgb,var(--bt-primary)_12%,transparent)]"
      >
        <PencilIcon className="h-3.5 w-3.5" />
      </EditScheduleItemButton>
      <NewScheduleItemButton
        jobId={jobId}
        scheduleId={scheduleId}
        jobName={jobName}
        existingItems={existingItems}
        phases={phases}
        staff={staff}
        aria-label="Add schedule item"
        className="inline-flex h-7 w-7 items-center justify-center rounded text-[var(--bt-primary)] hover:bg-[color-mix(in_srgb,var(--bt-primary)_12%,transparent)]"
        style={{ background: "transparent" }}
      >
        <PlusCircleIcon className="h-3.5 w-3.5" />
      </NewScheduleItemButton>
    </div>
  );

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
          <span className="font-medium text-[var(--bt-text)]">
            {row.title}
            {criticalPath && row.isCriticalPath ? (
              <span className="ml-1.5 text-[10px] font-semibold" style={{ color: "#2563EB" }}>
                CP
              </span>
            ) : null}
          </span>
        </EditScheduleItemButton>
      ),
    },
    { key: "start", header: "Start", sortable: true, sortValue: (row) => row.startDate, render: (row) => formatDateUtc(new Date(row.startDate)) },
    {
      key: "workdays",
      header: "Workdays",
      align: "right",
      sortable: true,
      sortValue: (row) => row.durationDays,
      render: (row) => `${row.durationDays} ${row.durationDays === 1 ? "day" : "days"}`,
    },
    { key: "end", header: "End", sortable: true, sortValue: (row) => row.endDate, render: (row) => formatDateUtc(new Date(row.endDate)) },
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
          <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: "color-mix(in srgb, #2563EB 14%, transparent)", color: "#2563EB" }}>
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

  return (
    <DataGrid
      columns={columns}
      rows={rows}
      rowKey={(row) => row.id}
      selectable
      viewKey="schedule-list"
      defaultHiddenKeys={["end", "progress", "float", "critical", "confirmed"]}
      emptyMessage="No schedule items yet."
      rowActions={actionSlot}
    />
  );
}
