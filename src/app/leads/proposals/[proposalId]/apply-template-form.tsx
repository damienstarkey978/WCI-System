"use client";

import { useActionState } from "react";

import { applyTemplateAction, type ActionState } from "./actions";

const INITIAL: ActionState = {};

export function ApplyTemplateForm({ proposalId, templates }: { proposalId: string; templates: readonly { id: string; name: string }[] }) {
  const [state, formAction, pending] = useActionState(applyTemplateAction, INITIAL);

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="proposalId" value={proposalId} />
      <select name="templateId" defaultValue="" className="rounded border px-2 py-1.5 text-sm" style={{ borderColor: "var(--bt-border)" }}>
        <option value="" disabled>
          Apply a template…
        </option>
        {templates.map((template) => (
          <option key={template.id} value={template.id}>
            {template.name}
          </option>
        ))}
      </select>
      <button
        type="submit"
        disabled={pending}
        className="rounded border px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
        style={{ borderColor: "var(--bt-border)", color: "var(--bt-text)" }}
      >
        {pending ? "Applying…" : "Apply"}
      </button>
      {state.ok ? <span className="text-xs text-[var(--bt-muted)]">Applied. Sections are added, existing text is kept.</span> : null}
      {state.error ? <span className="text-xs text-red-600">{state.error}</span> : null}
    </form>
  );
}
