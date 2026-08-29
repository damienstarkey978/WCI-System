"use client";

import { useActionState, useRef } from "react";

import { draftJobEstimateAction, type DraftEstimateActionState } from "./actions";

const INITIAL: DraftEstimateActionState = {};

/**
 * "Draft with AI" (handoff-ai-analysis-and-jarvis-deep-integration-spec.md Part
 * 3.3b) — describe the scope (optionally with photos), and the AI estimate
 * assistant drafts a full cost-coded Estimate against this job's real cost code
 * and materials catalog. Always lands as an ordinary DRAFT a human reviews.
 */
export function DraftEstimateWithAiForm({ jobId }: { jobId: string }) {
  const [state, formAction, pending] = useActionState(draftJobEstimateAction, INITIAL);
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
      <h2 className="text-sm font-semibold text-[var(--bt-text)]">Draft an estimate with AI</h2>
      <p className="mt-0.5 text-xs text-[var(--bt-muted)]">
        Describe the scope of work — measurements, materials, anything relevant — and optionally attach site photos.
      </p>

      <div className="mt-3 flex flex-col gap-2">
        <textarea
          name="notes"
          required
          rows={3}
          placeholder="e.g. Full kitchen remodel: demo existing cabinets, new 30 LF of shaker cabinets, quartz counters, tile backsplash..."
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
          {pending ? "Drafting…" : "Draft estimate"}
        </button>
      </div>
    </form>
  );
}
