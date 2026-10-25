"use client";

import Link from "next/link";

import { DataGrid, type DataGridColumn } from "@/components/shell/DataGrid";
import { formatDate } from "@/lib/format";

const TYPE_LABEL: Record<string, string> = { CALL: "Call", EMAIL: "Email", MEETING: "Meeting", NOTE: "Note", TASK: "Task" };

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
      key: "leadName",
      header: "Lead",
      sortable: true,
      render: (row) => (
        <Link href={`/leads/${row.leadId}?tab=activities`} className="font-medium text-[var(--bt-primary)] hover:underline">
          {row.leadName}
        </Link>
      ),
    },
    { key: "type", header: "Type", sortable: true, sortValue: (row) => TYPE_LABEL[row.type] ?? row.type, render: (row) => TYPE_LABEL[row.type] ?? row.type },
    {
      key: "note",
      header: "Note",
      render: (row) => (
        <div>
          <span className="line-clamp-2">{row.note}</span>
          {row.type === "TASK" ? (
            <span className="text-xs text-[var(--bt-muted)]">{row.completed ? "Done" : row.dueDate ? `Due ${formatDate(new Date(row.dueDate))}` : "Open"}</span>
          ) : null}
        </div>
      ),
    },
    { key: "by", header: "By", render: (row) => row.by ?? "" },
    { key: "occurredAt", header: "Date", sortable: true, render: (row) => formatDate(new Date(row.occurredAt)) },
  ];
  return <DataGrid columns={columns} rows={rows} rowKey={(row) => row.id} viewKey="lead-activities" selectable emptyMessage="No activity matches." />;
}
