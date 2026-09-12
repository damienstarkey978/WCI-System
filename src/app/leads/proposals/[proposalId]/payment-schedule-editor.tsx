"use client";

import { useActionState } from "react";

import { addProposalDrawAction, deleteProposalDrawAction, type ActionState } from "./actions";

const INITIAL: ActionState = {};

export interface ProposalDrawRow {
  readonly id: string;
  readonly title: string;
  readonly pctOfContractBasisPoints: number;
}

/**
 * The payment schedule a client is agreeing to as part of this proposal — deposit,
 * rough-in, final, etc. Percentages rather than dollars, same reason the Job-level
 * Draw Schedule (src/app/jobs/[jobId]/invoices/draw-panels.tsx) is: the real contract
 * price isn't fixed until an option is chosen, and shouldn't be re-typed here.
 *
 * On acceptance, acceptProposal() (src/lib/proposals/service.ts) copies these rows
 * onto the new Job as a real DrawSchedule — this is the offer, that is what actually
 * bills.
 */
export function PaymentScheduleEditor({
  proposalId,
  draws,
  editable,
}: {
  proposalId: string;
  draws: readonly ProposalDrawRow[];
  editable: boolean;
}) {
  const [state, formAction, pending] = useActionState(addProposalDrawAction, INITIAL);
  const totalBasisPoints = draws.reduce((sum, draw) => sum + draw.pctOfContractBasisPoints, 0);
  const overAllocated = totalBasisPoints > 10_000;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-[var(--bt-muted)]">Payment schedule</span>
        <span className="text-xs" style={{ color: overAllocated ? "var(--bt-danger)" : "var(--bt-muted)" }}>
          {(totalBasisPoints / 100).toFixed(2)}% of contract allocated
        </span>
      </div>

      {draws.length === 0 ? (
        <p className="text-xs text-[var(--bt-muted)]">
          No payment schedule yet — the client will be billed however the office invoices the job once it&apos;s under way.
        </p>
      ) : (
        <ul className="flex flex-col gap-1">
          {draws.map((draw) => (
            <li
              key={draw.id}
              className="flex items-center justify-between gap-2 rounded border px-2.5 py-1.5 text-sm"
              style={{ borderColor: "var(--bt-border)" }}
            >
              <span className="text-[var(--bt-text)]">{draw.title}</span>
              <span className="flex items-center gap-2">
                <span className="text-[var(--bt-muted)]">{(draw.pctOfContractBasisPoints / 100).toFixed(2)}%</span>
                {editable ? (
                  <form action={deleteProposalDrawAction}>
                    <input type="hidden" name="proposalId" value={proposalId} />
                    <input type="hidden" name="drawId" value={draw.id} />
                    <button type="submit" className="text-xs text-[var(--bt-muted)] hover:text-[var(--bt-danger)]">
                      Remove
                    </button>
                  </form>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      )}

      {editable ? (
        <form action={formAction} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="proposalId" value={proposalId} />
          <label className="flex min-w-40 flex-1 flex-col gap-1 text-xs text-[var(--bt-muted)]">
            Milestone
            <input
              name="title"
              placeholder="e.g. Deposit, Rough-in complete, Final"
              className="rounded border px-2 py-1.5 text-sm outline-none focus:border-[var(--bt-primary)]"
              style={{ borderColor: "var(--bt-border)" }}
            />
          </label>
          <label className="flex w-28 flex-col gap-1 text-xs text-[var(--bt-muted)]">
            % of contract
            <input
              name="percent"
              inputMode="decimal"
              placeholder="10"
              className="rounded border px-2 py-1.5 text-sm outline-none focus:border-[var(--bt-primary)]"
              style={{ borderColor: "var(--bt-border)" }}
            />
          </label>
          <button
            type="submit"
            disabled={pending}
            className="rounded border px-3 py-1.5 text-xs font-medium text-[var(--bt-text)] disabled:opacity-50"
            style={{ borderColor: "var(--bt-border)" }}
          >
            {pending ? "…" : "Add milestone"}
          </button>
          {state.error ? <span className="text-xs text-red-600">{state.error}</span> : null}
        </form>
      ) : null}
    </div>
  );
}
