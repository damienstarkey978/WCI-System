"use client";

import { useActionState, useState } from "react";

import { addSelectionOptionAction, updateSelectionAction, type ActionState } from "../actions";

const INITIAL: ActionState = {};

export function SelectionDetailForm({
  jobId,
  selectionId,
  editable,
  allowances,
  initial,
}: {
  jobId: string;
  selectionId: string;
  editable: boolean;
  allowances: readonly { id: string; title: string }[];
  initial: {
    title: string;
    description: string;
    dueDate: string;
    category: string;
    location: string;
    requireClientSelection: boolean;
    selectionType: "SINGLE" | "SHARED";
    allowanceId: string;
  };
}) {
  const [state, formAction, pending] = useActionState(updateSelectionAction, INITIAL);
  const [selectionType, setSelectionType] = useState<"SINGLE" | "SHARED">(initial.selectionType);

  return (
    <form action={formAction} className="grid gap-3 rounded-lg border bg-[color-mix(in_srgb,var(--bt-primary)_6%,transparent)] p-4 sm:grid-cols-2" style={{ borderColor: "var(--bt-border)" }}>
      <input type="hidden" name="jobId" value={jobId} />
      <input type="hidden" name="selectionId" value={selectionId} />
      <input type="hidden" name="selectionType" value={selectionType} />
      <input type="hidden" name="description" value={initial.description} />

      <div className="flex flex-col gap-3">
        <label className="grid gap-1 text-sm">
          <span className="text-xs font-medium text-[var(--bt-muted)]">Title</span>
          <input
            name="title"
            required
            defaultValue={initial.title}
            disabled={!editable}
            className="rounded border px-3 py-2 text-sm disabled:opacity-60"
            style={{ borderColor: "var(--bt-border)" }}
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-[var(--bt-text)]">
          <input type="checkbox" name="requireClientSelection" defaultChecked={initial.requireClientSelection} disabled={!editable} />
          Require client to make a selection
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-xs font-medium text-[var(--bt-muted)]">Category</span>
          <input
            name="category"
            defaultValue={initial.category}
            disabled={!editable}
            placeholder="Unassigned"
            className="rounded border px-3 py-2 text-sm disabled:opacity-60"
            style={{ borderColor: "var(--bt-border)" }}
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-xs font-medium text-[var(--bt-muted)]">Location</span>
          <input
            name="location"
            defaultValue={initial.location}
            disabled={!editable}
            placeholder="Unassigned"
            className="rounded border px-3 py-2 text-sm disabled:opacity-60"
            style={{ borderColor: "var(--bt-border)" }}
          />
        </label>
      </div>

      <div className="flex flex-col gap-3">
        <div className="grid gap-1 text-sm">
          <span className="text-xs font-medium text-[var(--bt-muted)]">Selection type</span>
          <div className="flex overflow-hidden rounded border" style={{ borderColor: "var(--bt-border)" }}>
            {(
              [
                ["SINGLE", "Single"],
                ["SHARED", "Shared"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                disabled={!editable}
                onClick={() => setSelectionType(value)}
                className="flex-1 px-3 py-2 text-sm font-medium disabled:opacity-60"
                style={{
                  background: selectionType === value ? "var(--bt-primary)" : "transparent",
                  color: selectionType === value ? "var(--bt-on-primary)" : "var(--bt-text)",
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <label className="grid gap-1 text-sm">
          <span className="text-xs font-medium text-[var(--bt-muted)]">Allowance</span>
          <select
            name="allowanceId"
            defaultValue={initial.allowanceId}
            disabled={!editable}
            className="rounded border px-3 py-2 text-sm disabled:opacity-60"
            style={{ borderColor: "var(--bt-border)" }}
          >
            <option value="">None</option>
            {allowances.map((allowance) => (
              <option key={allowance.id} value={allowance.id}>
                {allowance.title}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-xs font-medium text-[var(--bt-muted)]">Deadline</span>
          <input
            type="date"
            name="dueDate"
            defaultValue={initial.dueDate}
            disabled={!editable}
            className="rounded border px-3 py-2 text-sm disabled:opacity-60"
            style={{ borderColor: "var(--bt-border)" }}
          />
        </label>
      </div>

      {state.error ? <p className="text-xs text-red-600 sm:col-span-2">{state.error}</p> : null}
      {state.ok ? <p className="text-xs text-green-700 sm:col-span-2">Saved.</p> : null}

      {editable ? (
        <button
          type="submit"
          disabled={pending}
          className="justify-self-start rounded border px-4 py-2 text-sm font-semibold disabled:opacity-50 sm:col-span-2"
          style={{ borderColor: "var(--bt-border)" }}
        >
          {pending ? "Saving…" : "Save"}
        </button>
      ) : null}
    </form>
  );
}

export function AddChoiceForm({ jobId, selectionId }: { jobId: string; selectionId: string }) {
  const [state, formAction, pending] = useActionState(addSelectionOptionAction, INITIAL);

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2 border-t pt-3" style={{ borderColor: "var(--bt-border)" }}>
      <input type="hidden" name="jobId" value={jobId} />
      <input type="hidden" name="selectionId" value={selectionId} />
      <label className="grid min-w-[10rem] flex-1 gap-1 text-sm">
        <span className="text-xs font-medium text-[var(--bt-muted)]">Choice title</span>
        <input name="optionTitle" required className="rounded border px-3 py-2 text-sm" style={{ borderColor: "var(--bt-border)" }} />
      </label>
      <label className="grid w-28 gap-1 text-sm">
        <span className="text-xs font-medium text-[var(--bt-muted)]">Cost</span>
        <input name="optionPrice" inputMode="decimal" required placeholder="0.00" className="rounded border px-2 py-2 text-sm" style={{ borderColor: "var(--bt-border)" }} />
      </label>
      <label className="grid w-28 gap-1 text-sm">
        <span className="text-xs font-medium text-[var(--bt-muted)]">Client price</span>
        <input name="optionClientPrice" inputMode="decimal" required placeholder="0.00" className="rounded border px-2 py-2 text-sm" style={{ borderColor: "var(--bt-border)" }} />
      </label>
      <button type="submit" disabled={pending} className="rounded px-3 py-2 text-sm font-semibold text-[var(--bt-on-primary)] disabled:opacity-50" style={{ background: "var(--bt-primary)" }}>
        {pending ? "Adding…" : "+ Add choice"}
      </button>
      {state.error ? <p className="w-full text-xs text-red-600">{state.error}</p> : null}
    </form>
  );
}
