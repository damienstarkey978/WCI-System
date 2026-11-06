"use client";

import { useActionState, useState } from "react";

import { PlusIcon } from "@/components/shell/icons";

import { updateRfiAction, type ActionState } from "../actions";

const INITIAL: ActionState = {};
const REMINDERS = ["None", "1 Day Before", "2 Days Before", "1 Week Before"] as const;

const fieldClass =
  "rounded border px-3 py-2 text-sm disabled:opacity-60 outline-none focus:border-[var(--bt-primary)]";
const fieldStyle = { borderColor: "var(--bt-border)" } as const;

/**
 * Buildertrend RFI detail body: Details card + Question card, Save as secondary
 * outlined control (matches BT Cancel/Save chrome — no Send).
 */
export function RfiDetailForm({
  jobId,
  rfiId,
  rfiNumber,
  editable,
  users,
  initial,
}: {
  jobId: string;
  rfiId: string;
  rfiNumber: string;
  editable: boolean;
  users: readonly { id: string; email: string; name: string | null }[];
  initial: {
    title: string;
    question: string;
    dueDate: string;
    assigneeUserId: string;
    reminder: string;
    relatedItemRef: string;
  };
}) {
  const [state, formAction, pending] = useActionState(updateRfiAction, INITIAL);
  const [showRelated, setShowRelated] = useState(Boolean(initial.relatedItemRef));

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="jobId" value={jobId} />
      <input type="hidden" name="rfiId" value={rfiId} />

      <section className="rounded-lg border bg-[var(--bt-panel-bg)] p-4" style={{ borderColor: "var(--bt-border)" }}>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-3">
            <label className="grid gap-1 text-sm">
              <span className="text-xs font-medium text-[var(--bt-muted)]">Title</span>
              <input
                name="title"
                required
                defaultValue={initial.title}
                disabled={!editable}
                className={fieldClass}
                style={fieldStyle}
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-xs font-medium text-[var(--bt-muted)]">ID #</span>
              <input
                value={rfiNumber}
                readOnly
                className={`${fieldClass} opacity-80`}
                style={{ ...fieldStyle, background: "var(--bt-bg)" }}
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-xs font-medium text-[var(--bt-muted)]">Assignee</span>
              <select
                name="assigneeUserId"
                defaultValue={initial.assigneeUserId}
                disabled={!editable}
                className={fieldClass}
                style={fieldStyle}
              >
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
              <span className="text-xs font-medium text-[var(--bt-muted)]">Due date</span>
              <input
                type="date"
                name="dueDate"
                required
                defaultValue={initial.dueDate}
                disabled={!editable}
                className={fieldClass}
                style={fieldStyle}
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-xs font-medium text-[var(--bt-muted)]">Reminder</span>
              <select
                name="reminder"
                defaultValue={initial.reminder || "None"}
                disabled={!editable}
                className={fieldClass}
                style={fieldStyle}
              >
                {REMINDERS.map((label) => (
                  <option key={label} value={label}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid gap-1 text-sm">
              <span className="text-xs font-medium text-[var(--bt-muted)]">Related</span>
              {showRelated || !editable ? (
                <input
                  name="relatedItemRef"
                  defaultValue={initial.relatedItemRef}
                  disabled={!editable}
                  className={fieldClass}
                  style={fieldStyle}
                />
              ) : (
                <>
                  <input type="hidden" name="relatedItemRef" value="" />
                  <button
                    type="button"
                    onClick={() => setShowRelated(true)}
                    className="inline-flex items-center gap-1 self-start text-sm font-medium text-[var(--bt-primary)] hover:underline"
                  >
                    <PlusIcon className="h-3.5 w-3.5" />
                    Add a Related item
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-lg border bg-[var(--bt-panel-bg)] p-4" style={{ borderColor: "var(--bt-border)" }}>
        <label className="grid gap-1 text-sm">
          <span className="text-sm font-semibold text-[var(--bt-text)]">Question</span>
          <textarea
            name="question"
            required
            rows={6}
            defaultValue={initial.question}
            disabled={!editable}
            className={fieldClass}
            style={fieldStyle}
          />
        </label>
      </section>

      {state.error ? <p className="text-xs text-red-600">{state.error}</p> : null}
      {state.ok ? <p className="text-xs text-green-700">Saved.</p> : null}

      {editable ? (
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={pending}
            className="rounded border px-4 py-2 text-sm font-semibold disabled:opacity-50"
            style={{ borderColor: "var(--bt-border)" }}
          >
            {pending ? "Saving…" : "Save"}
          </button>
        </div>
      ) : null}
    </form>
  );
}
