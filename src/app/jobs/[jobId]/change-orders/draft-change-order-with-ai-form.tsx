"use client";

import { useActionState, useRef } from "react";

import { draftChangeOrderAction, type DraftChangeOrderActionState } from "./actions";

const INITIAL: DraftChangeOrderActionState = {};

/**
 * "Draft with AI" (handoff-ai-analysis-and-jarvis-deep-integration-spec.md Part
 * 3.3b) — describe what changed (optionally with photos) and it drafts a full
 * ITEMIZED change order against this job's real cost code catalog, reusing the
 * same pipeline as the Estimates page's AI draft. Always DRAFT — approving it is
 * still a separate human action that actually touches the Budget.
 */
export function DraftChangeOrderWithAiForm({ jobId }: { jobId: string }) {
  const [state, formAction, pending] = useActionState(draftChangeOrderAction, INITIAL);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      action={async (formData) => {
        await formAction(formData);
        formRef.current?.reset();
      }}
      className="rounded-lg border border-dashed bg-white p-4"
      style={{ borderColor: "var(--bt-border)" }}
    >
      <input type="hidden" name="jobId" value={jobId} />
      <h2 className="text-sm font-semibold text-[var(--bt-text)]">Draft a change order with AI</h2>
      <p className="mt-0.5 text-xs text-[var(--bt-muted)]">Describe what changed — added scope, a client request, a field condition — and optionally attach photos.</p>

      <div className="mt-3 grid gap-2">
        <input
          name="title"
          required
          placeholder="Title, e.g. 'Add egress window to basement bedroom'"
          className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]"
          style={{ borderColor: "var(--bt-border)" }}
        />
        <textarea
          name="notes"
          required
          rows={3}
          placeholder="What changed and why — measurements, materials, anything relevant"
          className="w-full rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]"
          style={{ borderColor: "var(--bt-border)" }}
        />
        <input type="file" name="photos" multiple accept="image/jpeg,image/png,image/webp,image/gif" className="text-xs" />
      </div>

      {state.error ? (
        <p role="alert" className="mt-2 text-xs text-red-600">
          {state.error}
        </p>
      ) : null}

      {state.result ? (
        <div className="mt-2 rounded border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
          Drafted &quot;{state.result.title}&quot; with {state.result.lineItemCount} line item
          {state.result.lineItemCount === 1 ? "" : "s"} — see it in the list below.
          {state.result.assumptions.length > 0 ? (
            <ul className="mt-1 list-disc pl-4">
              {state.result.assumptions.map((assumption) => (
                <li key={assumption}>{assumption}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <div className="mt-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          style={{ background: "var(--bt-primary)" }}
        >
          {pending ? "Drafting…" : "Draft change order"}
        </button>
      </div>
    </form>
  );
}
