"use client";

import { useActionState } from "react";

import { updateWarrantyClaimAction, type ActionState } from "../actions";

const INITIAL: ActionState = {};
const PRIORITIES = ["Low", "Medium", "High"] as const;
const CLASSIFICATIONS = ["", "Workmanship", "Material", "Manufacturer", "Other"] as const;

export interface ClientOption {
  readonly id: string;
  readonly name: string;
}

export function WarrantyDetailForm({
  jobId,
  claimId,
  claimNumber,
  editable,
  clients,
  initial,
}: {
  jobId: string;
  claimId: string;
  claimNumber: string;
  editable: boolean;
  clients: readonly ClientOption[];
  initial: {
    title: string;
    description: string;
    category: string;
    priority: string;
    classification: string;
    internalNotes: string;
    addedCostCents: number;
    showClient: boolean;
    followUpDate: string;
    clientId: string;
  };
}) {
  const [state, formAction, pending] = useActionState(updateWarrantyClaimAction, INITIAL);
  const addedCostDefault = (initial.addedCostCents / 100).toFixed(2);

  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-lg border bg-[var(--bt-panel-bg)] p-4" style={{ borderColor: "var(--bt-border)" }}>
      <input type="hidden" name="jobId" value={jobId} />
      <input type="hidden" name="claimId" value={claimId} />

      <label className="grid gap-1 text-sm">
        <span className="text-xs font-medium text-[var(--bt-muted)]">Claim title</span>
        <input
          name="title"
          required
          defaultValue={initial.title}
          disabled={!editable}
          className="rounded border px-3 py-2 text-base font-medium disabled:opacity-60"
          style={{ borderColor: "var(--bt-border)" }}
        />
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-3">
          <label className="grid gap-1 text-sm">
            <span className="text-xs font-medium text-[var(--bt-muted)]">Claim #</span>
            <input value={claimNumber} readOnly className="rounded border px-3 py-2 text-sm opacity-80" style={{ borderColor: "var(--bt-border)", background: "var(--bt-bg)" }} />
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
            <span className="text-xs font-medium text-[var(--bt-muted)]">Priority</span>
            <select
              name="priority"
              defaultValue={initial.priority || "Low"}
              disabled={!editable}
              className="rounded border px-3 py-2 text-sm disabled:opacity-60"
              style={{ borderColor: "var(--bt-border)" }}
            >
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-xs font-medium text-[var(--bt-muted)]">Client</span>
            <select
              name="clientId"
              defaultValue={initial.clientId}
              disabled={!editable}
              className="rounded border px-3 py-2 text-sm disabled:opacity-60"
              style={{ borderColor: "var(--bt-border)" }}
            >
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
            <textarea
              name="description"
              required
              rows={4}
              defaultValue={initial.description}
              disabled={!editable}
              className="rounded border px-3 py-2 text-sm disabled:opacity-60"
              style={{ borderColor: "var(--bt-border)" }}
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-xs font-medium text-[var(--bt-muted)]">Internal comments</span>
            <textarea
              name="internalNotes"
              rows={3}
              defaultValue={initial.internalNotes}
              disabled={!editable}
              className="rounded border px-3 py-2 text-sm disabled:opacity-60"
              style={{ borderColor: "var(--bt-border)" }}
            />
          </label>
        </div>
      </div>

      <div className="grid gap-3 rounded-lg border p-3 sm:grid-cols-2" style={{ borderColor: "var(--bt-border)" }}>
        <label className="grid gap-1 text-sm">
          <span className="text-xs font-medium text-[var(--bt-muted)]">Classification</span>
          <select
            name="classification"
            defaultValue={initial.classification}
            disabled={!editable}
            className="rounded border px-3 py-2 text-sm disabled:opacity-60"
            style={{ borderColor: "var(--bt-border)" }}
          >
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
          <input
            name="addedCost"
            inputMode="decimal"
            defaultValue={addedCostDefault}
            disabled={!editable}
            className="rounded border px-3 py-2 text-sm disabled:opacity-60"
            style={{ borderColor: "var(--bt-border)" }}
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-xs font-medium text-[var(--bt-muted)]">Follow-up date</span>
          <input
            type="date"
            name="followUpDate"
            defaultValue={initial.followUpDate}
            disabled={!editable}
            className="rounded border px-3 py-2 text-sm disabled:opacity-60"
            style={{ borderColor: "var(--bt-border)" }}
          />
        </label>
        <label className="flex items-center gap-2 self-end pb-2 text-sm text-[var(--bt-text)]">
          <input type="checkbox" name="showClient" defaultChecked={initial.showClient} disabled={!editable} />
          Show client?
        </label>
      </div>

      {state.error ? <p className="text-xs text-red-600">{state.error}</p> : null}
      {state.ok ? <p className="text-xs text-green-700">Saved.</p> : null}

      {editable ? (
        <button type="submit" disabled={pending} className="self-start rounded border px-4 py-2 text-sm font-semibold disabled:opacity-50" style={{ borderColor: "var(--bt-border)" }}>
          {pending ? "Saving…" : "Save"}
        </button>
      ) : null}
    </form>
  );
}
