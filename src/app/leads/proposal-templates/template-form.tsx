"use client";

import { useActionState } from "react";

import { createTemplateAction, updateTemplateAction, type TemplateActionState } from "./actions";

const INITIAL: TemplateActionState = {};

export interface TemplateFormValues {
  readonly id?: string;
  readonly name: string;
  readonly description: string;
  readonly coverMessage: string;
  readonly sectionsText: string;
  readonly drawsText: string;
}

const FIELD = "rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]";

export function TemplateForm({ values }: { values?: TemplateFormValues }) {
  const editing = Boolean(values?.id);
  const [state, formAction, pending] = useActionState(editing ? updateTemplateAction : createTemplateAction, INITIAL);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      {values?.id ? <input type="hidden" name="templateId" value={values.id} /> : null}
      <label className="flex flex-col gap-1 text-xs font-semibold text-[var(--bt-muted)]">
        Template name
        <input name="name" required defaultValue={values?.name} className={FIELD} style={{ borderColor: "var(--bt-border)" }} placeholder="Kitchen remodel" />
      </label>
      <label className="flex flex-col gap-1 text-xs font-semibold text-[var(--bt-muted)]">
        Description (internal)
        <input name="description" defaultValue={values?.description} className={FIELD} style={{ borderColor: "var(--bt-border)" }} />
      </label>
      <label className="flex flex-col gap-1 text-xs font-semibold text-[var(--bt-muted)]">
        Cover message
        <textarea name="coverMessage" rows={4} defaultValue={values?.coverMessage} className={FIELD} style={{ borderColor: "var(--bt-border)" }} />
      </label>
      <label className="flex flex-col gap-1 text-xs font-semibold text-[var(--bt-muted)]">
        Scope sections. Start a section with &quot;# Title&quot;, then one bullet per line.
        <textarea
          name="sections"
          rows={10}
          defaultValue={values?.sectionsText}
          className={`${FIELD} font-mono`}
          style={{ borderColor: "var(--bt-border)" }}
          placeholder={"# Demolition\n- Remove existing cabinets\n- Haul away debris"}
        />
      </label>
      <label className="flex flex-col gap-1 text-xs font-semibold text-[var(--bt-muted)]">
        Payment schedule. One milestone per line as &quot;Title | percent&quot;. Must total 100% or less.
        <textarea
          name="draws"
          rows={4}
          defaultValue={values?.drawsText}
          className={`${FIELD} font-mono`}
          style={{ borderColor: "var(--bt-border)" }}
          placeholder={"Deposit | 30\nRough-in | 40\nFinal | 30"}
        />
      </label>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded px-4 py-2 text-sm font-semibold text-[var(--bt-on-primary)] disabled:opacity-50"
          style={{ background: "var(--bt-primary)" }}
        >
          {pending ? "Saving…" : editing ? "Save template" : "Create template"}
        </button>
        {state.ok ? <span className="text-xs text-[var(--bt-muted)]">Saved.</span> : null}
        {state.error ? <span className="text-xs text-red-600">{state.error}</span> : null}
      </div>
    </form>
  );
}
