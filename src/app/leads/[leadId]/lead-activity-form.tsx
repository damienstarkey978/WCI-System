"use client";

import { useActionState, useRef, useState } from "react";

import { ACTIVITY_TYPE_META, ACTIVITY_TYPE_ORDER, type LeadActivityTypeKey } from "@/components/leads/activity-type";

import { createLeadActivityAction, type ActionState } from "./actions";

const INITIAL: ActionState = {};

/**
 * Buildertrend-style "Add a Lead Activity" — type is picked via icon buttons
 * (Call / Email / Meeting / Note / Task), then note + optional due date for tasks.
 */
export function LeadActivityForm({ leadId }: { leadId: string }) {
  const [state, formAction, pending] = useActionState(createLeadActivityAction, INITIAL);
  const formRef = useRef<HTMLFormElement>(null);
  const [type, setType] = useState<LeadActivityTypeKey>("NOTE");

  return (
    <form
      ref={formRef}
      action={async (formData) => {
        formData.set("type", type);
        await formAction(formData);
        formRef.current?.reset();
        setType("NOTE");
      }}
      className="rounded-lg border bg-[var(--bt-panel-bg)] p-3 sm:p-4"
      style={{ borderColor: "var(--bt-border)" }}
    >
      <input type="hidden" name="leadId" value={leadId} />
      <input type="hidden" name="type" value={type} />

      <div className="text-xs font-semibold uppercase tracking-wide text-[var(--bt-muted)]">Add a Lead Activity</div>

      <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Activity type">
        {ACTIVITY_TYPE_ORDER.map((key) => {
          const meta = ACTIVITY_TYPE_META[key];
          const Icon = meta.Icon;
          const selected = type === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setType(key)}
              className="inline-flex items-center gap-1.5 rounded border px-2.5 py-1.5 text-xs font-semibold transition"
              style={
                selected
                  ? {
                      borderColor: meta.accent,
                      background: `color-mix(in srgb, ${meta.accent} 14%, transparent)`,
                      color: meta.accent,
                    }
                  : { borderColor: "var(--bt-border)", color: "var(--bt-muted)" }
              }
              aria-pressed={selected}
            >
              <Icon className="h-3.5 w-3.5" />
              {meta.label}
            </button>
          );
        })}
      </div>

      {type === "TASK" ? (
        <label className="mt-2 flex flex-col gap-1 text-xs text-[var(--bt-muted)]">
          Due date
          <input
            type="date"
            name="dueDate"
            className="w-full max-w-xs rounded border px-2.5 py-2 text-sm text-[var(--bt-text)] outline-none focus:border-[var(--bt-primary)]"
            style={{ borderColor: "var(--bt-border)" }}
          />
        </label>
      ) : (
        <input type="hidden" name="dueDate" value="" />
      )}

      <textarea
        name="note"
        required
        rows={3}
        placeholder={
          type === "CALL"
            ? "What did you discuss on the call?"
            : type === "EMAIL"
              ? "Summarize the email…"
              : type === "MEETING"
                ? "Meeting notes…"
                : type === "TASK"
                  ? "Follow-up task…"
                  : "Add a note…"
        }
        className="mt-2 w-full rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]"
        style={{ borderColor: "var(--bt-border)" }}
      />
      {state.error ? (
        <p role="alert" className="mt-2 text-xs text-red-600">
          {state.error}
        </p>
      ) : null}
      <div className="mt-2 flex justify-end">
        <button
          type="submit"
          disabled={pending}
          className="min-h-10 rounded px-4 py-2 text-sm font-semibold text-[var(--bt-on-primary)] disabled:opacity-50 sm:min-h-0 sm:py-1.5 sm:text-xs"
          style={{ background: "var(--bt-primary)" }}
        >
          {pending ? "Saving…" : "Add activity"}
        </button>
      </div>
    </form>
  );
}
