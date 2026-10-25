"use client";

import { DataGrid, type DataGridColumn } from "@/components/shell/DataGrid";
import { formatDate } from "@/lib/format";

import { setTodoStatusAction } from "./actions";

const PRIORITY_STYLE: Record<string, { bg: string; text: string }> = {
  HIGH: { bg: "color-mix(in srgb, var(--bt-danger) 14%, transparent)", text: "var(--bt-danger)" },
  MEDIUM: { bg: "color-mix(in srgb, var(--bt-hazard) 14%, transparent)", text: "var(--bt-hazard)" },
  LOW: { bg: "#e5e7eb", text: "#374151" },
};

export interface TaskRow {
  readonly id: string;
  readonly jobId: string;
  readonly title: string;
  readonly category: string | null;
  readonly priority: string;
  readonly status: string;
  readonly assignee: string | null;
  readonly dueDate: string | null;
}

/** Client half of the Tasks page; see purchase-orders-grid.tsx for why the split exists. */
export function TasksGrid({ rows, emptyMessage }: { rows: readonly TaskRow[]; emptyMessage: string }) {
  const columns: DataGridColumn<TaskRow>[] = [
    {
      key: "done",
      header: "Done",
      render: (row) => {
        const done = row.status === "DONE";
        return (
          <form action={setTodoStatusAction}>
            <input type="hidden" name="jobId" value={row.jobId} />
            <input type="hidden" name="todoId" value={row.id} />
            <input type="hidden" name="status" value={done ? "OPEN" : "DONE"} />
            <button
              type="submit"
              aria-label={done ? "Reopen" : "Mark done"}
              className="flex h-4 w-4 items-center justify-center rounded border-2 text-[10px] text-[var(--bt-on-primary)]"
              style={done ? { background: "var(--bt-primary)", borderColor: "var(--bt-primary)" } : { borderColor: "var(--bt-muted)" }}
            >
              {done ? "✓" : null}
            </button>
          </form>
        );
      },
    },
    {
      key: "title",
      header: "Title",
      sortable: true,
      render: (row) => <span className={row.status === "DONE" ? "text-[var(--bt-muted)] line-through" : "font-medium"}>{row.title}</span>,
    },
    { key: "category", header: "Tag", render: (row) => row.category ?? "" },
    {
      key: "priority",
      header: "Priority",
      render: (row) => {
        const style = PRIORITY_STYLE[row.priority] ?? PRIORITY_STYLE.MEDIUM;
        return (
          <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: style.bg, color: style.text }}>
            {row.priority}
          </span>
        );
      },
    },
    { key: "assignee", header: "Assigned to", render: (row) => row.assignee ?? "Unassigned" },
    { key: "dueDate", header: "Due", sortable: true, render: (row) => (row.dueDate ? formatDate(new Date(row.dueDate)) : "") },
  ];

  return <DataGrid columns={columns} rows={rows} rowKey={(row) => row.id} selectable emptyMessage={emptyMessage} />;
}
