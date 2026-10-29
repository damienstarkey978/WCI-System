"use client";

import { useActionState } from "react";

import { PermitStatus } from "@/generated/prisma/enums";
import { permitStatusLabel } from "@/lib/permitting/labels";

import { updatePermitFieldsAction, type ActionState } from "./actions";

const INITIAL: ActionState = {};

function dateInputValue(value: Date | string | null | undefined): string {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

export function EditPermitForm({
  jobId,
  permit,
}: {
  jobId: string;
  permit: {
    id: string;
    permitNumber: string | null;
    label: string | null;
    status: PermitStatus;
    issuedAt: Date | string | null;
    expiresAt: Date | string | null;
    jurisdiction: string | null;
    contractorName: string | null;
  };
}) {
  const [state, formAction, pending] = useActionState(updatePermitFieldsAction, INITIAL);

  return (
    <form
      action={formAction}
      className="mt-3 grid gap-2 rounded border p-2.5"
      style={{ borderColor: "var(--bt-border)" }}
    >
      <input type="hidden" name="jobId" value={jobId} />
      <input type="hidden" name="permitId" value={permit.id} />
      <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--bt-muted)]">
        Permit details
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="grid gap-0.5 text-[11px] text-[var(--bt-muted)]">
          Status
          <select
            name="status"
            defaultValue={permit.status}
            className="rounded border bg-white px-2 py-1.5 text-xs text-[var(--bt-text)]"
            style={{ borderColor: "var(--bt-border)" }}
          >
            {Object.values(PermitStatus).map((status) => (
              <option key={status} value={status}>
                {permitStatusLabel(status)}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-0.5 text-[11px] text-[var(--bt-muted)]">
          Permit #
          <input
            name="permitNumber"
            type="text"
            defaultValue={permit.permitNumber ?? ""}
            className="rounded border bg-white px-2 py-1.5 text-xs text-[var(--bt-text)]"
            style={{ borderColor: "var(--bt-border)" }}
          />
        </label>
        <label className="grid gap-0.5 text-[11px] text-[var(--bt-muted)]">
          Label
          <input
            name="label"
            type="text"
            defaultValue={permit.label ?? ""}
            className="rounded border bg-white px-2 py-1.5 text-xs text-[var(--bt-text)]"
            style={{ borderColor: "var(--bt-border)" }}
          />
        </label>
        <label className="grid gap-0.5 text-[11px] text-[var(--bt-muted)]">
          Jurisdiction
          <input
            name="jurisdiction"
            type="text"
            defaultValue={permit.jurisdiction ?? ""}
            placeholder="e.g. City of Jacksonville"
            className="rounded border bg-white px-2 py-1.5 text-xs text-[var(--bt-text)]"
            style={{ borderColor: "var(--bt-border)" }}
          />
        </label>
        <label className="grid gap-0.5 text-[11px] text-[var(--bt-muted)]">
          Issue date
          <input
            name="issuedAt"
            type="date"
            defaultValue={dateInputValue(permit.issuedAt)}
            className="rounded border bg-white px-2 py-1.5 text-xs text-[var(--bt-text)]"
            style={{ borderColor: "var(--bt-border)" }}
          />
        </label>
        <label className="grid gap-0.5 text-[11px] text-[var(--bt-muted)]">
          Expiry
          <input
            name="expiresAt"
            type="date"
            defaultValue={dateInputValue(permit.expiresAt)}
            className="rounded border bg-white px-2 py-1.5 text-xs text-[var(--bt-text)]"
            style={{ borderColor: "var(--bt-border)" }}
          />
        </label>
        <label className="grid gap-0.5 text-[11px] text-[var(--bt-muted)] sm:col-span-2">
          Contractor
          <input
            name="contractorName"
            type="text"
            defaultValue={permit.contractorName ?? ""}
            className="rounded border bg-white px-2 py-1.5 text-xs text-[var(--bt-text)]"
            style={{ borderColor: "var(--bt-border)" }}
          />
        </label>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded px-2.5 py-1.5 text-xs font-semibold text-[var(--bt-on-primary)] disabled:opacity-50"
          style={{ background: "var(--bt-primary)" }}
        >
          {pending ? "Saving…" : "Save permit"}
        </button>
        {state.error ? <p className="text-xs text-red-600">{state.error}</p> : null}
        {state.ok ? <p className="text-xs text-[var(--bt-muted)]">Saved.</p> : null}
      </div>
    </form>
  );
}
