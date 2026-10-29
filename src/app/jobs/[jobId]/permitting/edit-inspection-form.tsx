"use client";

import { useActionState } from "react";

import { InspectionResult } from "@/generated/prisma/enums";
import { inspectionResultLabel } from "@/lib/permitting/labels";

import { updateInspectionFieldsAction, type ActionState } from "./actions";

const INITIAL: ActionState = {};

function dateInputValue(value: Date | string | null | undefined): string {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

export function EditInspectionForm({
  jobId,
  inspection,
}: {
  jobId: string;
  inspection: {
    id: string;
    name: string;
    result: InspectionResult;
    passedAt: Date | string | null;
    confirmationNumber: string | null;
    inspector: string | null;
  };
}) {
  const [state, formAction, pending] = useActionState(updateInspectionFieldsAction, INITIAL);

  return (
    <form action={formAction} className="mt-1 grid gap-1.5 border-t px-2.5 py-2" style={{ borderColor: "var(--bt-border)" }}>
      <input type="hidden" name="jobId" value={jobId} />
      <input type="hidden" name="inspectionId" value={inspection.id} />
      <div className="grid gap-1.5 sm:grid-cols-2">
        <label className="grid gap-0.5 text-[10px] text-[var(--bt-muted)]">
          Result
          <select
            name="result"
            defaultValue={inspection.result}
            className="rounded border bg-white px-2 py-1 text-xs text-[var(--bt-text)]"
            style={{ borderColor: "var(--bt-border)" }}
          >
            {Object.values(InspectionResult).map((result) => (
              <option key={result} value={result}>
                {inspectionResultLabel(result)}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-0.5 text-[10px] text-[var(--bt-muted)]">
          Pass / completed date
          <input
            name="passedAt"
            type="date"
            defaultValue={dateInputValue(inspection.passedAt)}
            className="rounded border bg-white px-2 py-1 text-xs text-[var(--bt-text)]"
            style={{ borderColor: "var(--bt-border)" }}
          />
        </label>
        <label className="grid gap-0.5 text-[10px] text-[var(--bt-muted)]">
          Confirmation #
          <input
            name="confirmationNumber"
            type="text"
            defaultValue={inspection.confirmationNumber ?? ""}
            className="rounded border bg-white px-2 py-1 text-xs text-[var(--bt-text)]"
            style={{ borderColor: "var(--bt-border)" }}
          />
        </label>
        <label className="grid gap-0.5 text-[10px] text-[var(--bt-muted)]">
          Inspector
          <input
            name="inspector"
            type="text"
            defaultValue={inspection.inspector ?? ""}
            className="rounded border bg-white px-2 py-1 text-xs text-[var(--bt-text)]"
            style={{ borderColor: "var(--bt-border)" }}
          />
        </label>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded px-2 py-1 text-[10px] font-semibold text-[var(--bt-on-primary)] disabled:opacity-50"
          style={{ background: "var(--bt-primary)" }}
        >
          {pending ? "Saving…" : "Save inspection"}
        </button>
        {state.error ? <p className="text-[10px] text-red-600">{state.error}</p> : null}
      </div>
    </form>
  );
}
