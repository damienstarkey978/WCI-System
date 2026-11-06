"use client";

import Link from "next/link";
import { useActionState, useRef, useState, type ReactNode } from "react";

import { CalendarIcon, ChatIcon, CloseIcon, TaskIcon } from "@/components/shell/icons";
import { formatDate } from "@/lib/format";

import { saveTodoAction, setTodoStatusAction, type ActionState } from "./actions";

const INITIAL: ActionState = {};

export interface TaskDetailValues {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly priority: string;
  readonly status: string;
  readonly category: string | null;
  readonly dueDate: string | null;
  readonly assigneeUserId: string | null;
  readonly createdAt: string;
  readonly checklist: readonly { id: string; title: string; isDone: boolean }[];
}

export interface StaffOption {
  readonly id: string;
  readonly name: string;
}

function EllipsisIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className={className} aria-hidden>
      <circle cx="4" cy="10" r="1.5" />
      <circle cx="10" cy="10" r="1.5" />
      <circle cx="16" cy="10" r="1.5" />
    </svg>
  );
}

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden>
      <path d="M5.5 8l4.5 4.5L14.5 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function TaskDetailDrawer({
  jobId,
  jobName,
  staff,
  initial,
  children,
}: {
  jobId: string;
  jobName: string;
  staff: readonly StaffOption[];
  initial: TaskDetailValues;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(saveTodoAction, INITIAL);
  const [subtasks, setSubtasks] = useState(initial.checklist.map((item) => item.title));
  const [newSubtask, setNewSubtask] = useState("");
  const [category, setCategory] = useState(initial.category ?? "");
  const dateRef = useRef<HTMLInputElement>(null);
  const done = initial.status === "DONE";

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="w-full text-left hover:underline">
        {children}
      </button>
      {open ? (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/30" onClick={() => setOpen(false)} />
          <aside
            className="relative flex h-full w-full max-w-md flex-col border-l bg-[var(--bt-panel-bg)] shadow-xl"
            style={{ borderColor: "var(--bt-border)" }}
            role="dialog"
            aria-modal="true"
            aria-label="Task detail"
          >
            <form action={formAction} className="flex h-full flex-col">
              <input type="hidden" name="jobId" value={jobId} />
              <input type="hidden" name="todoId" value={initial.id} />
              <input type="hidden" name="category" value={category} />
              {subtasks.map((title, index) => (
                <input key={`${title}-${index}`} type="hidden" name="checklistItems" value={title} />
              ))}

              {/* BT header: ⋯ · chat · Mark complete · X */}
              <div className="flex items-center justify-end gap-1 border-b px-3 py-2" style={{ borderColor: "var(--bt-border)" }}>
                <span
                  className="inline-flex h-8 w-8 items-center justify-center rounded text-[var(--bt-muted)]"
                  title="More"
                  aria-hidden
                >
                  <EllipsisIcon className="h-4 w-4" />
                </span>
                <span
                  className="inline-flex h-8 w-8 items-center justify-center rounded text-[var(--bt-muted)]"
                  title="Comments"
                  aria-hidden
                >
                  <ChatIcon className="h-4 w-4" />
                </span>
                <button
                  type="submit"
                  formAction={async () => {
                    const data = new FormData();
                    data.set("jobId", jobId);
                    data.set("todoId", initial.id);
                    data.set("status", done ? "OPEN" : "DONE");
                    await setTodoStatusAction(data);
                    setOpen(false);
                  }}
                  className="ml-1 inline-flex items-center gap-1 rounded px-3 py-1.5 text-xs font-semibold text-[var(--bt-on-primary)]"
                  style={{ background: "var(--bt-primary)" }}
                >
                  {done ? "Reopen" : "Mark complete"}
                  <ChevronDownIcon className="h-3 w-3 opacity-80" />
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close"
                  className="rounded p-1.5 text-[var(--bt-muted)] hover:bg-black/5"
                >
                  <CloseIcon className="h-4 w-4" />
                </button>
              </div>

              <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
                <Link href={`/jobs/${jobId}`} className="text-xs font-medium text-[var(--bt-primary)] hover:underline">
                  {jobName}
                </Link>

                <div className="flex items-start gap-2">
                  <TaskIcon className="mt-1 h-5 w-5 shrink-0 text-[var(--bt-primary)]" />
                  <input
                    name="title"
                    required
                    defaultValue={initial.title}
                    className="w-full border-0 bg-transparent text-lg font-semibold uppercase tracking-wide text-[var(--bt-text)] outline-none"
                  />
                </div>
                <p className="text-xs text-[var(--bt-muted)]">Created {formatDate(new Date(initial.createdAt))}</p>

                <label className="grid gap-1 text-sm">
                  <span className="text-xs font-medium text-[var(--bt-muted)]">Assignees</span>
                  <select
                    name="assigneeUserId"
                    defaultValue={initial.assigneeUserId ?? ""}
                    className="rounded border px-3 py-2 text-sm"
                    style={{ borderColor: "var(--bt-border)" }}
                  >
                    <option value="">No assignee</option>
                    {staff.map((person) => (
                      <option key={person.id} value={person.id}>
                        {person.name}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="grid gap-2">
                  <span className="text-xs font-medium text-[var(--bt-muted)]">Due date</span>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => dateRef.current?.showPicker?.() ?? dateRef.current?.focus()}
                      className="inline-flex items-center gap-1.5 rounded border px-3 py-1.5 text-xs font-semibold text-[var(--bt-primary)] hover:bg-black/5"
                      style={{ borderColor: "color-mix(in srgb, var(--bt-primary) 40%, var(--bt-border))" }}
                    >
                      <CalendarIcon className="h-3.5 w-3.5" />
                      Choose date
                    </button>
                  </div>
                  <input
                    ref={dateRef}
                    type="date"
                    name="dueDate"
                    defaultValue={initial.dueDate ?? ""}
                    className="rounded border px-3 py-2 text-sm"
                    style={{ borderColor: "var(--bt-border)" }}
                  />
                </div>

                <div className="grid gap-1 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-[var(--bt-muted)]">Tags</span>
                    <span className="text-[11px] font-medium text-[var(--bt-primary)]">Add</span>
                  </div>
                  <p className="text-xs text-[var(--bt-muted)]">Add tags</p>
                </div>

                <label className="grid gap-1 text-sm">
                  <span className="text-xs font-medium text-[var(--bt-muted)]">Description</span>
                  <textarea
                    name="description"
                    defaultValue={initial.description}
                    rows={4}
                    className="rounded border px-3 py-2 text-sm"
                    style={{ borderColor: "var(--bt-border)" }}
                  />
                </label>

                <div className="grid gap-3 border-t pt-3" style={{ borderColor: "var(--bt-border)" }}>
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--bt-muted)]">Fields</p>
                  <label className="grid gap-1 text-sm">
                    <span className="text-xs font-medium text-[var(--bt-muted)]">Priority</span>
                    <select
                      name="priority"
                      defaultValue={initial.priority}
                      className="rounded border px-3 py-2 text-sm"
                      style={{ borderColor: "var(--bt-border)" }}
                    >
                      <option value="LOW">Low</option>
                      <option value="MEDIUM">Medium</option>
                      <option value="HIGH">High</option>
                    </select>
                  </label>

                  <div className="grid gap-1 text-sm">
                    <span className="text-xs font-medium text-[var(--bt-muted)]">Type</span>
                    {category ? (
                      <span
                        className="inline-flex w-fit items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium text-[var(--bt-text)]"
                        style={{ borderColor: "var(--bt-border)", background: "color-mix(in srgb, var(--bt-border) 35%, white)" }}
                      >
                        {category}
                        <button
                          type="button"
                          aria-label="Clear type"
                          className="text-[var(--bt-muted)] hover:text-red-600"
                          onClick={() => setCategory("")}
                        >
                          ×
                        </button>
                      </span>
                    ) : (
                      <input
                        value={category}
                        onChange={(e) => setCategory(e.target.value)}
                        placeholder="Punch list, inspection, …"
                        className="rounded border px-3 py-2 text-sm"
                        style={{ borderColor: "var(--bt-border)" }}
                      />
                    )}
                    <span className="text-[11px] text-[var(--bt-muted)]">Use “punch” to show this task on the Punch list tab.</span>
                  </div>
                </div>

                <div className="grid gap-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-[var(--bt-text)]">Subtasks</h3>
                    <span className="text-xs font-medium text-[var(--bt-primary)]">+ Add</span>
                  </div>
                  <ul className="space-y-1">
                    {subtasks.map((title, index) => (
                      <li
                        key={`${title}-${index}`}
                        className="flex items-center justify-between rounded border px-2 py-1.5 text-sm"
                        style={{ borderColor: "var(--bt-border)" }}
                      >
                        <span>{title}</span>
                        <button
                          type="button"
                          className="text-xs text-[var(--bt-muted)] hover:text-red-600"
                          onClick={() => setSubtasks(subtasks.filter((_, i) => i !== index))}
                        >
                          Remove
                        </button>
                      </li>
                    ))}
                  </ul>
                  <div className="flex gap-2">
                    <input
                      value={newSubtask}
                      onChange={(e) => setNewSubtask(e.target.value)}
                      placeholder="Add a subtask"
                      className="flex-1 rounded border px-2 py-1.5 text-sm"
                      style={{ borderColor: "var(--bt-border)" }}
                    />
                    <button
                      type="button"
                      className="text-sm font-medium text-[var(--bt-primary)] hover:underline"
                      onClick={() => {
                        const trimmed = newSubtask.trim();
                        if (!trimmed) return;
                        setSubtasks([...subtasks, trimmed]);
                        setNewSubtask("");
                      }}
                    >
                      + Add
                    </button>
                  </div>
                </div>

                <div className="grid gap-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-[var(--bt-text)]">Attachments</h3>
                  </div>
                  <p className="text-[11px] text-[var(--bt-muted)]">
                    Attachments: open the job{" "}
                    <a href={`/jobs/${jobId}/files`} className="font-medium text-[var(--bt-primary)] hover:underline">
                      Files
                    </a>{" "}
                    page. Linking files directly onto a task will land here when that flow ships.
                  </p>
                </div>

                {state.error ? <p className="text-xs text-red-600">{state.error}</p> : null}
                {state.ok ? <p className="text-xs text-green-700">Saved.</p> : null}
              </div>

              <div className="border-t px-4 py-3" style={{ borderColor: "var(--bt-border)" }}>
                <button
                  type="submit"
                  disabled={pending}
                  className="w-full rounded px-4 py-2 text-sm font-semibold text-[var(--bt-on-primary)] disabled:opacity-50"
                  style={{ background: "var(--bt-primary)" }}
                >
                  {pending ? "Saving…" : "Save"}
                </button>
              </div>
            </form>
          </aside>
        </div>
      ) : null}
    </>
  );
}
