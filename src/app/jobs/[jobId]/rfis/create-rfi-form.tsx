"use client";

import { useActionState, useState } from "react";

import { CloseIcon, PlusIcon } from "@/components/shell/icons";

import { createRfiAction, type ActionState } from "./actions";

const INITIAL: ActionState = {};

const REMINDERS = ["None", "1 Day Before", "2 Days Before", "1 Week Before"] as const;

export interface UserOption {
  readonly id: string;
  readonly email: string;
  readonly name?: string | null;
}

const fieldClass =
  "rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)] disabled:opacity-60";
const fieldStyle = { borderColor: "var(--bt-border)" } as const;

/**
 * Buildertrend New RFI modal body: Details card (two-column) + Question card,
 * Cancel / Save footer. No Send — email delivery is not wired for RFIs.
 */
export function CreateRfiForm({
  jobId,
  jobName,
  users,
  onCancel,
}: {
  jobId: string;
  jobName: string;
  users: readonly UserOption[];
  onCancel?: () => void;
}) {
  const [state, formAction, pending] = useActionState(createRfiAction, INITIAL);
  const [showRelated, setShowRelated] = useState(false);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="jobId" value={jobId} />

      <div className="flex items-start justify-between gap-3 border-b px-1 pb-3" style={{ borderColor: "var(--bt-border)" }}>
        <div>
          <div className="text-xs text-[var(--bt-muted)]">{jobName}</div>
          <h2 className="text-lg font-semibold text-[var(--bt-text)]">RFI</h2>
        </div>
        {onCancel ? (
          <button type="button" onClick={onCancel} aria-label="Close" className="rounded p-1 text-[var(--bt-muted)] hover:bg-black/5">
            <CloseIcon className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      <section className="rounded-lg border bg-[var(--bt-panel-bg)] p-4" style={{ borderColor: "var(--bt-border)" }}>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-3">
            <label className="grid gap-1 text-sm">
              <span className="text-xs font-medium text-[var(--bt-muted)]">Title</span>
              <input name="title" required className={fieldClass} style={fieldStyle} />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-xs font-medium text-[var(--bt-muted)]">ID #</span>
              <input
                value="(Auto Assign #)"
                readOnly
                className={`${fieldClass} opacity-80`}
                style={{ ...fieldStyle, background: "var(--bt-bg)" }}
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-xs font-medium text-[var(--bt-muted)]">Assignee</span>
              <select name="assigneeUserId" defaultValue="" className={fieldClass} style={fieldStyle}>
                <option value="">Unassigned</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name || u.email}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-xs font-medium text-[var(--bt-muted)]">Viewers</span>
              <input
                readOnly
                value=""
                placeholder="Only active subs with job access to this job appear here."
                className={`${fieldClass} opacity-80`}
                style={{ ...fieldStyle, background: "var(--bt-bg)" }}
              />
            </label>
          </div>

          <div className="flex flex-col gap-3">
            <label className="grid gap-1 text-sm">
              <span className="text-xs font-medium text-[var(--bt-muted)]">
                Due date <span className="text-red-600">*</span>
              </span>
              <input type="date" name="dueDate" required className={fieldClass} style={fieldStyle} />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-xs font-medium text-[var(--bt-muted)]">Reminder</span>
              <select name="reminder" defaultValue="None" className={fieldClass} style={fieldStyle}>
                {REMINDERS.map((label) => (
                  <option key={label} value={label}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid gap-1 text-sm">
              <span className="text-xs font-medium text-[var(--bt-muted)]">Related</span>
              {showRelated ? (
                <input
                  name="relatedItemRef"
                  placeholder="e.g. schedule_item:… or leave blank"
                  className={fieldClass}
                  style={fieldStyle}
                  autoFocus
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setShowRelated(true)}
                  className="inline-flex items-center gap-1 self-start text-sm font-medium text-[var(--bt-primary)] hover:underline"
                >
                  <PlusIcon className="h-3.5 w-3.5" />
                  Add a Related item
                </button>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-lg border bg-[var(--bt-panel-bg)] p-4" style={{ borderColor: "var(--bt-border)" }}>
        <label className="grid gap-1 text-sm">
          <span className="text-sm font-semibold text-[var(--bt-text)]">Question</span>
          <textarea name="question" required rows={6} className={fieldClass} style={fieldStyle} />
        </label>
      </section>

      {state.error ? (
        <p role="alert" className="text-xs text-red-600">
          {state.error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-end gap-2 border-t pt-3" style={{ borderColor: "var(--bt-border)" }}>
        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            className="rounded border px-4 py-2 text-sm font-semibold text-[var(--bt-text)] hover:bg-black/5"
            style={{ borderColor: "var(--bt-border)" }}
          >
            Cancel
          </button>
        ) : null}
        <button
          type="submit"
          disabled={pending}
          className="rounded border px-4 py-2 text-sm font-semibold text-[var(--bt-text)] hover:bg-black/5 disabled:opacity-50"
          style={{ borderColor: "var(--bt-border)" }}
        >
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}
