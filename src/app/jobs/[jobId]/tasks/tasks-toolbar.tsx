"use client";

import { useState } from "react";

import { CreateModal } from "@/components/shell/CreateModal";

import type { StaffOption } from "./task-detail-drawer";
import { TodoForm } from "./todo-form";

/**
 * Tasks header chrome: working "+ Task" create modal only.
 * Import / Share / Feedback / Settings stubs removed until they have real handlers.
 */
export function TasksToolbar({ jobId, staff }: { jobId: string; staff: readonly StaffOption[] }) {
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <button
        type="button"
        onClick={() => setCreateOpen(true)}
        className="inline-flex min-h-9 items-center rounded px-3 py-1.5 text-sm font-semibold text-[var(--bt-on-primary)]"
        style={{ background: "var(--bt-primary)" }}
      >
        + Task
      </button>

      <CreateModal triggerLabel="+ Task" title="New task" open={createOpen} onOpenChange={setCreateOpen} hideTrigger>
        <TodoForm jobId={jobId} staff={staff} />
      </CreateModal>
    </div>
  );
}
