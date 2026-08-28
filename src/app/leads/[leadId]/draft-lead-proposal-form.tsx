"use client";

import { useActionState } from "react";

import { draftLeadProposalAction, type ActionState } from "./actions";

const INITIAL: ActionState = {};

/**
 * The "Jarvis" entry point for proposal drafting: sales dumps the scope of work,
 * measurements and photos in, and gets back a full estimate + client-facing
 * proposal narrative to review — never sent anywhere without a human clicking Send.
 */
export function DraftLeadProposalForm({
  leadId,
  defaultEmail,
  defaultPhone,
  needsContact,
}: {
  leadId: string;
  defaultEmail: string;
  defaultPhone: string;
  needsContact: boolean;
}) {
  const [state, formAction, pending] = useActionState(draftLeadProposalAction, INITIAL);

  return (
    <form action={formAction} className="rounded-lg border bg-white p-4" style={{ borderColor: "var(--bt-border)" }}>
      <input type="hidden" name="leadId" value={leadId} />
      <h2 className="text-sm font-semibold text-[var(--bt-text)]">Draft with Jarvis</h2>
      <p className="mt-1 text-xs text-[var(--bt-muted)]">
        Give Jarvis the scope of work, measurements, and any photos — it drafts a full line-item
        estimate and the client-facing proposal that goes with it. Everything comes back as a DRAFT
        for you to review and edit before it&apos;s ever sent to the client.
      </p>

      <label className="mt-3 grid gap-1 text-sm">
        <span className="text-xs font-medium text-[var(--bt-muted)]">Scope of work, measurements, notes</span>
        <textarea
          name="notes"
          required
          rows={5}
          placeholder="e.g. 2 bed 1 bath interior repaint, walls and trim, standard 8ft ceilings, ~1400 sqft..."
          className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]"
          style={{ borderColor: "var(--bt-border)" }}
        />
      </label>

      <label className="mt-3 grid gap-1 text-sm">
        <span className="text-xs font-medium text-[var(--bt-muted)]">Photos (optional)</span>
        <input
          name="photos"
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          multiple
          className="text-sm text-[var(--bt-text)]"
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
          {pending ? "Jarvis is drafting…" : "Draft with Jarvis"}
        </button>
      </div>
    </form>
  );
}
