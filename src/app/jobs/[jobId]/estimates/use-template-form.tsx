"use client";

import { useActionState, useRef } from "react";

import { createEstimateFromTemplateAction, type ActionState } from "./actions";

const INITIAL: ActionState = {};

export interface TemplateOption {
  readonly id: string;
  readonly name: string;
  readonly lineItemCount: number;
}

export function UseTemplateForm({ jobId, templates }: { jobId: string; templates: readonly TemplateOption[] }) {
  const [state, formAction, pending] = useActionState(createEstimateFromTemplateAction, INITIAL);
  const formRef = useRef<HTMLFormElement>(null);

  if (templates.length === 0) return null;

  return (
    <form
      ref={formRef}
      action={async (formData) => {
        await formAction(formData);
        formRef.current?.reset();
      }}
      className="rounded-lg border bg-[var(--bt-panel-bg)] p-4"
      style={{ borderColor: "var(--bt-border)" }}
    >
      <input type="hidden" name="jobId" value={jobId} />
      <h2 className="text-sm font-semibold text-[var(--bt-text)]">New estimate from template</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <label className="grid gap-1 text-sm">
          <span className="text-xs font-medium text-[var(--bt-muted)]">Template</span>
          <select name="templateId" required defaultValue="" className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]" style={{ borderColor: "var(--bt-border)" }}>
            <option value="" disabled>
              Choose a template
            </option>
            {templates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name} ({template.lineItemCount} lines)
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm sm:col-span-2">
          <span className="text-xs font-medium text-[var(--bt-muted)]">Title</span>
          <input name="title" required className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]" style={{ borderColor: "var(--bt-border)" }} />
        </label>
      </div>
      {state.error ? (
        <p role="alert" className="mt-2 text-xs text-red-600">
          {state.error}
        </p>
      ) : null}
      <div className="mt-3">
        <button type="submit" disabled={pending} className="rounded px-4 py-2 text-sm font-semibold text-[var(--bt-on-primary)] disabled:opacity-50" style={{ background: "var(--bt-primary)" }}>
          {pending ? "Creating…" : "Create from template"}
        </button>
      </div>
    </form>
  );
}
