"use client";

import Link from "next/link";

import { ActivityTypeIcon, activityTypeLabel } from "@/components/leads/activity-type";
import { DataGrid, type DataGridColumn } from "@/components/shell/DataGrid";
import { formatDate } from "@/lib/format";

export interface ActivityRow {
  readonly id: string;
  readonly leadId: string;
  readonly leadName: string;
  readonly type: string;
  readonly note: string;
  readonly by: string | null;
  readonly occurredAt: string;
  readonly dueDate: string | null;
  readonly completed: boolean;
}

/** Client half of the Lead Activities list; see purchase-orders-grid.tsx for why the split exists. */
export function ActivitiesGrid({ rows }: { rows: readonly ActivityRow[] }) {
  const columns: DataGridColumn<ActivityRow>[] = [
    {
      key: "type",
      header: "Type",
      sortable: true,
      sortValue: (row) => activityTypeLabel(row.type),
      render: (row) => (
        <div className="flex items-center gap-2">
          <ActivityTypeIcon type={row.type} size="sm" completed={row.completed} />
          <span className="text-sm font-medium text-[var(--bt-text)]">{activityTypeLabel(row.type)}</span>
        </div>
      ),
    },
    {
      key: "note",
      header: "Activity",
      render: (row) => (
        <div className="min-w-0">
          <span className={`line-clamp-2 text-sm ${row.completed ? "text-[var(--bt-muted)] line-through" : "text-[var(--bt-text)]"}`}>
            {row.note}
          </span>
          {row.type === "TASK" ? (
            <div className="mt-0.5 text-xs text-[var(--bt-muted)]">
              {row.completed ? "Completed" : row.dueDate ? `Due ${formatDate(new Date(row.dueDate))}` : "Open task"}
            </div>
          ) : null}
        </div>
      ),
    },
    {
      key: "leadName",
      header: "Lead opportunity",
      sortable: true,
      render: (row) => (
        <Link href={`/leads/${row.leadId}?tab=activities`} className="font-medium text-[var(--bt-primary)] hover:underline">
          {row.leadName}
        </Link>
      ),
    },
    { key: "by", header: "Assigned / by", render: (row) => <span className="text-sm text-[var(--bt-muted)]">{row.by ?? "—"}</span> },
    {
      key: "occurredAt",
      header: "Date",
      sortable: true,
      render: (row) => <span className="whitespace-nowrap text-sm">{formatDate(new Date(row.occurredAt))}</span>,
    },
  ];
  return <DataGrid columns={columns} rows={rows} rowKey={(row) => row.id} viewKey="lead-activities" selectable emptyMessage="No activity matches." />;
}
