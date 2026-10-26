"use client";

import { useActionState } from "react";

import { createWarrantyClaimAction, type ActionState } from "./actions";

const INITIAL: ActionState = {};
const PRIORITIES = ["Low", "Medium", "High"] as const;
const CLASSIFICATIONS = ["", "Workmanship", "Material", "Manufacturer", "Other"] as const;

export interface ClientOption {
  readonly id: string;
  readonly name: string;
}

export function CreateClaimForm({ jobId, clients }: { jobId: string; clients: readonly ClientOption[] }) {
  const [state, formAction, pending] = useActionState(createWarrantyClaimAction, INITIAL);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="jobId" value={jobId} />

      <label className="grid gap-1 text-sm">
        <span className="text-xs font-medium text-[var(--bt-muted)]">Claim title</span>
        <input
          name="title"
          required
          placeholder="Add claim title"
          className="rounded border px-3 py-2 text-base font-medium outline-none focus:border-[var(--bt-primary)]"
          style={{ borderColor: "var(--bt-border)" }}
        />
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-3">
          <label className="grid gap-1 text-sm">
            <span className="text-xs font-medium text-[var(--bt-muted)]">Claim #</span>
            <input
              name="claimNumber"
              placeholder="(Auto assign)"
              className="rounded border px-3 py-2 text-sm"
              style={{ borderColor: "var(--bt-border)" }}
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-xs font-medium text-[var(--bt-muted)]">Category</span>
            <input name="category" placeholder="Unassigned" className="rounded border px-3 py-2 text-sm" style={{ borderColor: "var(--bt-border)" }} />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-xs font-medium text-[var(--bt-muted)]">Priority</span>
            <select name="priority" defaultValue="Low" className="rounded border px-3 py-2 text-sm" style={{ borderColor: "var(--bt-border)" }}>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-xs font-medium text-[var(--bt-muted)]">Client</span>
            <select name="clientId" defaultValue="" className="rounded border px-3 py-2 text-sm" style={{ borderColor: "var(--bt-border)" }}>
              <option value="">None</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex flex-col gap-3">
          <label className="grid gap-1 text-sm">
            <span className="text-xs font-medium text-[var(--bt-muted)]">Problem description</span>
            <textarea name="description" required rows={4} className="rounded border px-3 py-2 text-sm" style={{ borderColor: "var(--bt-border)" }} />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-xs font-medium text-[var(--bt-muted)]">Internal comments</span>
            <textarea name="internalNotes" rows={3} className="rounded border px-3 py-2 text-sm" style={{ borderColor: "var(--bt-border)" }} />
          </label>
        </div>
      </div>

      <div className="grid gap-3 rounded-lg border p-3 sm:grid-cols-2" style={{ borderColor: "var(--bt-border)" }}>
        <label className="grid gap-1 text-sm">
          <span className="text-xs font-medium text-[var(--bt-muted)]">Classification</span>
          <select name="classification" defaultValue="" className="rounded border px-3 py-2 text-sm" style={{ borderColor: "var(--bt-border)" }}>
            <option value="">Please select one</option>
            {CLASSIFICATIONS.filter(Boolean).map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-xs font-medium text-[var(--bt-muted)]">Added cost</span>
          <input name="addedCost" inputMode="decimal" placeholder="0.00" defaultValue="0.00" className="rounded border px-3 py-2 text-sm" style={{ borderColor: "var(--bt-border)" }} />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-xs font-medium text-[var(--bt-muted)]">Follow-up date</span>
          <input type="date" name="followUpDate" className="rounded border px-3 py-2 text-sm" style={{ borderColor: "var(--bt-border)" }} />
        </label>
        <label className="flex items-center gap-2 self-end pb-2 text-sm text-[var(--bt-text)]">
          <input type="checkbox" name="showClient" defaultChecked />
          Show client?
        </label>
      </div>

      <p className="text-xs text-[var(--bt-muted)]">Save the claim to add a service appointment on the detail page.</p>

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
