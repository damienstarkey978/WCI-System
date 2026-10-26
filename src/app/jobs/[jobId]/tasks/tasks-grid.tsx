"use client";

import { DataGrid, type DataGridColumn } from "@/components/shell/DataGrid";
import { formatDate } from "@/lib/format";

import { setTodoStatusAction } from "./actions";
import { TaskDetailDrawer, type StaffOption, type TaskDetailValues } from "./task-detail-drawer";

export interface TaskRow {
  readonly id: string;
  readonly jobId: string;
  readonly title: string;
  readonly category: string | null;
  readonly priority: string;
  readonly status: string;
  readonly assignee: string | null;
  readonly dueDate: string | null;
  readonly detail: TaskDetailValues;
}

/** Client half of the Tasks page; see purchase-orders-grid.tsx for why the split exists. */
export function TasksGrid({
  rows,
  emptyMessage,
  jobId,
  jobName,
  staff,
}: {
  rows: readonly TaskRow[];
  emptyMessage: string;
  jobId: string;
  jobName: string;
  staff: readonly StaffOption[];
}) {
  const columns: DataGridColumn<TaskRow>[] = [
    {
      key: "done",
      header: "",
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
      header: "Task",
      sortable: true,
      render: (row) => (
        <TaskDetailDrawer jobId={jobId} jobName={jobName} staff={staff} initial={row.detail}>
          <span className={row.status === "DONE" ? "text-[var(--bt-muted)] line-through" : "font-medium text-[var(--bt-primary)]"}>
            {row.title}
          </span>
        </TaskDetailDrawer>
      ),
    },
    { key: "dueDate", header: "Due date", sortable: true, render: (row) => (row.dueDate ? formatDate(new Date(row.dueDate)) : "") },
    { key: "assignee", header: "Assign", render: (row) => row.assignee ?? "No assignee" },
    { key: "category", header: "Type", render: (row) => row.category ?? "" },
    {
      key: "priority",
      header: "Priority",
      render: (row) => row.priority,
    },
  ];

  return <DataGrid columns={columns} rows={rows} rowKey={(row) => row.id} viewKey="tasks" selectable emptyMessage={emptyMessage} />;
}
