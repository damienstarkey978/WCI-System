"use client";

import { useActionState, useState } from "react";

import { createSelectionAction, type ActionState } from "./actions";
import { SelectionOptionRows } from "./option-rows";

const INITIAL: ActionState = {};

export interface AllowanceOption {
  readonly id: string;
  readonly title: string;
}

export function CreateSelectionForm({ jobId, allowances }: { jobId: string; allowances: readonly AllowanceOption[] }) {
  const [state, formAction, pending] = useActionState(createSelectionAction, INITIAL);
  const [selectionType, setSelectionType] = useState<"SINGLE" | "SHARED">("SINGLE");
  const [tab, setTab] = useState<"choices" | "description">("choices");

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="jobId" value={jobId} />
      <input type="hidden" name="selectionType" value={selectionType} />

      <div className="grid gap-3 rounded-lg border bg-[color-mix(in_srgb,var(--bt-primary)_6%,transparent)] p-4 sm:grid-cols-2" style={{ borderColor: "var(--bt-border)" }}>
        <div className="flex flex-col gap-3">
          <label className="grid gap-1 text-sm">
            <span className="text-xs font-medium text-[var(--bt-muted)]">
              Title <span className="text-red-600">*</span>
            </span>
            <input name="title" required className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]" style={{ borderColor: "var(--bt-border)" }} />
          </label>
          <label className="flex items-center gap-2 text-sm text-[var(--bt-text)]">
            <input type="checkbox" name="requireClientSelection" />
            Require client to make a selection
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-xs font-medium text-[var(--bt-muted)]">Category</span>
            <input name="category" placeholder="Unassigned" className="rounded border px-3 py-2 text-sm" style={{ borderColor: "var(--bt-border)" }} />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-xs font-medium text-[var(--bt-muted)]">Location</span>
            <input name="location" placeholder="Unassigned" className="rounded border px-3 py-2 text-sm" style={{ borderColor: "var(--bt-border)" }} />
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
                  onClick={() => setSelectionType(value)}
                  className="flex-1 px-3 py-2 text-sm font-medium"
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
            <span className="text-xs font-medium text-[var(--bt-muted)]">
              {selectionType === "SHARED" ? "Shared allowance" : "Single allowance"}
            </span>
            <select name="allowanceId" defaultValue="" className="rounded border px-3 py-2 text-sm" style={{ borderColor: "var(--bt-border)" }}>
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
            <input type="date" name="dueDate" className="rounded border px-3 py-2 text-sm" style={{ borderColor: "var(--bt-border)" }} />
          </label>
        </div>
      </div>

      <div className="flex gap-3 border-b" style={{ borderColor: "var(--bt-border)" }}>
        {(
          [
            ["choices", "Choices"],
            ["description", "Description"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className="-mb-px border-b-2 px-1 py-2 text-sm font-medium"
            style={{
              borderColor: tab === key ? "var(--bt-primary)" : "transparent",
              color: tab === key ? "var(--bt-primary)" : "var(--bt-muted)",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <div className={tab === "choices" ? "flex flex-col gap-2" : "hidden"}>
        <p className="text-xs text-[var(--bt-muted)]">
          You can save with no choices and add them on the detail page (Buildertrend flow). Or add them now.
        </p>
        <SelectionOptionRows />
      </div>
      <label className={tab === "description" ? "grid gap-1 text-sm" : "hidden"}>
        <span className="text-xs font-medium text-[var(--bt-muted)]">Description</span>
        <textarea name="description" rows={5} className="rounded border px-3 py-2 text-sm" style={{ borderColor: "var(--bt-border)" }} />
      </label>

      {state.error ? (
        <p role="alert" className="text-xs text-red-600">
          {state.error}
        </p>
      ) : null}

      <button type="submit" disabled={pending} className="self-end rounded px-4 py-2 text-sm font-semibold text-[var(--bt-on-primary)] disabled:opacity-50" style={{ background: "var(--bt-primary)" }}>
        {pending ? "Saving…" : "Save"}
      </button>
    </form>
  );
}
