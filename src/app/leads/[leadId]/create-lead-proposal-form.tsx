"use client";

import { useActionState } from "react";

import { CostCodeLineItems, type CostCodeOption } from "@/components/financial/CostCodeLineItems";

import { createLeadProposalAction, type ActionState } from "./actions";

const INITIAL: ActionState = {};

export function CreateLeadProposalForm({
  leadId,
  costCodes,
  defaultEmail,
  defaultPhone,
  needsContact,
}: {
  leadId: string;
  costCodes: readonly CostCodeOption[];
  defaultEmail: string;
  defaultPhone: string;
  /** True when the lead has no email on file — the client can't be created without one. */
  needsContact: boolean;
}) {
  const [state, formAction, pending] = useActionState(createLeadProposalAction, INITIAL);

  return (
    <form action={formAction} className="rounded-lg border bg-[var(--bt-panel-bg)] p-4" style={{ borderColor: "var(--bt-border)" }}>
      <input type="hidden" name="leadId" value={leadId} />
      <h2 className="text-sm font-semibold text-[var(--bt-text)]">New proposal</h2>
      <p className="mt-1 text-xs text-[var(--bt-muted)]">
        Creating a proposal converts this lead to a job (if it hasn&apos;t been already) and prices it off a new estimate.
      </p>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm">
          <span className="text-xs font-medium text-[var(--bt-muted)]">Title</span>
          <input
            name="title"
            required
            className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]"
            style={{ borderColor: "var(--bt-border)" }}
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-xs font-medium text-[var(--bt-muted)]">Default rate %</span>
          <input
            name="defaultRate"
            inputMode="decimal"
            placeholder="0"
            className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]"
            style={{ borderColor: "var(--bt-border)" }}
          />
        </label>
      </div>

      <label className="mt-3 grid gap-1 text-sm">
        <span className="text-xs font-medium text-[var(--bt-muted)]">Cover message</span>
        <textarea
          name="coverMessage"
          rows={2}
          className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]"
          style={{ borderColor: "var(--bt-border)" }}
        />
      </label>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm">
          <span className="text-xs font-medium text-[var(--bt-muted)]">
            Client email {needsContact ? <span className="text-red-600">*</span> : null}
          </span>
          <input
            name="clientEmail"
            type="email"
            required={needsContact}
            defaultValue={defaultEmail}
            className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]"
            style={{ borderColor: "var(--bt-border)" }}
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-xs font-medium text-[var(--bt-muted)]">Client phone</span>
          <input
            name="clientPhone"
            defaultValue={defaultPhone}
            className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]"
            style={{ borderColor: "var(--bt-border)" }}
          />
        </label>
      </div>

      <div className="mt-3">
        <CostCodeLineItems costCodes={costCodes} />
      </div>

      {state.error ? (
        <p role="alert" className="mt-2 text-xs text-red-600">
          {state.error}
        </p>
      ) : null}

      <div className="mt-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          style={{ background: "var(--bt-primary)" }}
        >
          {pending ? "Creating…" : "Create proposal"}
        </button>
      </div>
    </form>
  );
}
