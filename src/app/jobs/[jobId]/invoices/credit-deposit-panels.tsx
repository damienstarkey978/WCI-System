"use client";

import { useActionState } from "react";

import {
  applyCreditMemoAction,
  applyDepositAction,
  createCreditMemoAction,
  createDepositAction,
  issueCreditMemoAction,
  receiveDepositAction,
  refundDepositAction,
  voidCreditMemoAction,
  type ActionState,
} from "./credit-deposit-actions";

const INITIAL: ActionState = {};

const PRIMARY = "rounded px-3 py-1.5 text-xs font-semibold text-[var(--bt-on-primary)] disabled:opacity-50";
const SECONDARY =
  "rounded border px-3 py-1.5 text-xs font-semibold text-[var(--bt-text)] disabled:opacity-50 hover:bg-black/5";
const FIELD = "rounded border px-2 py-1.5 text-xs outline-none focus:border-[var(--bt-primary)]";

export interface OpenInvoiceOption {
  readonly id: string;
  readonly label: string;
}

function Err({ state }: { state: ActionState }) {
  if (!state.error) return null;
  return (
    <p role="alert" className="mt-1 text-xs" style={{ color: "var(--bt-danger)" }}>
      {state.error}
    </p>
  );
}

/** A picker of invoices that still owe something — the only ones worth applying to. */
function InvoicePicker({ invoices }: { invoices: readonly OpenInvoiceOption[] }) {
  return (
    <select name="invoiceId" defaultValue="" className={FIELD} style={{ borderColor: "var(--bt-border)" }}>
      <option value="">Choose an invoice…</option>
      {invoices.map((invoice) => (
        <option key={invoice.id} value={invoice.id}>
          {invoice.label}
        </option>
      ))}
    </select>
  );
}

export function CreateCreditMemoForm({
  jobId,
  suggestedNumber,
  invoices,
}: {
  jobId: string;
  suggestedNumber: string;
  invoices: readonly OpenInvoiceOption[];
}) {
  const [state, action, pending] = useActionState(createCreditMemoAction, INITIAL);

  return (
    <details className="rounded-lg border bg-[var(--bt-panel-bg)] p-4" style={{ borderColor: "var(--bt-border)" }}>
      <summary className="cursor-pointer text-sm font-semibold text-[var(--bt-text)]">New credit memo</summary>
      <form action={action} className="mt-3 flex flex-wrap items-end gap-2">
        <input type="hidden" name="jobId" value={jobId} />
        <label className="flex flex-col gap-1 text-xs text-[var(--bt-muted)]">
          Memo #
          <input name="memoNumber" defaultValue={suggestedNumber} className={FIELD} style={{ borderColor: "var(--bt-border)" }} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-[var(--bt-muted)]">
          Amount
          <input name="amount" placeholder="0.00" inputMode="decimal" className={FIELD} style={{ borderColor: "var(--bt-border)" }} />
        </label>
        <label className="flex min-w-40 flex-1 flex-col gap-1 text-xs text-[var(--bt-muted)]">
          Reason
          <input name="reason" placeholder="Allowance returned" className={FIELD} style={{ borderColor: "var(--bt-border)" }} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-[var(--bt-muted)]">
          Against invoice (optional)
          <InvoicePicker invoices={invoices} />
        </label>
        <button type="submit" disabled={pending} className={PRIMARY} style={{ background: "var(--bt-primary)" }}>
          {pending ? "Saving…" : "Create"}
        </button>
        <Err state={state} />
      </form>
    </details>
  );
}

export function CreditMemoActions({
  jobId,
  creditMemoId,
  status,
  invoices,
}: {
  jobId: string;
  creditMemoId: string;
  status: string;
  invoices: readonly OpenInvoiceOption[];
}) {
  const [issueState, issueAction, issuing] = useActionState(issueCreditMemoAction, INITIAL);
  const [applyState, applyAction, applying] = useActionState(applyCreditMemoAction, INITIAL);
  const [voidState, voidAction, voiding] = useActionState(voidCreditMemoAction, INITIAL);

  const hidden = (
    <>
      <input type="hidden" name="jobId" value={jobId} />
      <input type="hidden" name="creditMemoId" value={creditMemoId} />
    </>
  );

  // APPLIED and VOID are terminal — an applied credit has already reduced what the
  // client owes, and undoing it here would restore a balance nobody re-billed.
  if (status === "APPLIED" || status === "VOID") {
    return <span className="text-xs text-[var(--bt-muted)]">—</span>;
  }

  return (
    <div className="flex flex-col items-start gap-1.5">
      {status === "DRAFT" ? (
        <form action={issueAction}>
          {hidden}
          <button type="submit" disabled={issuing} className={PRIMARY} style={{ background: "var(--bt-primary)" }}>
            {issuing ? "Issuing…" : "Issue"}
          </button>
          <Err state={issueState} />
        </form>
      ) : (
        <form action={applyAction} className="flex flex-wrap items-center gap-1.5">
          {hidden}
          <InvoicePicker invoices={invoices} />
          <button type="submit" disabled={applying} className={PRIMARY} style={{ background: "var(--bt-primary)" }}>
            {applying ? "Applying…" : "Apply"}
          </button>
          <Err state={applyState} />
        </form>
      )}
      <form action={voidAction}>
        {hidden}
        <button type="submit" disabled={voiding} className={SECONDARY} style={{ borderColor: "var(--bt-border)" }}>
          {voiding ? "Voiding…" : "Void"}
        </button>
        <Err state={voidState} />
      </form>
    </div>
  );
}

export function CreateDepositForm({ jobId }: { jobId: string }) {
  const [state, action, pending] = useActionState(createDepositAction, INITIAL);

  return (
    <details className="rounded-lg border bg-[var(--bt-panel-bg)] p-4" style={{ borderColor: "var(--bt-border)" }}>
      <summary className="cursor-pointer text-sm font-semibold text-[var(--bt-text)]">Request a deposit</summary>
      <form action={action} className="mt-3 flex flex-wrap items-end gap-2">
        <input type="hidden" name="jobId" value={jobId} />
        <label className="flex min-w-40 flex-1 flex-col gap-1 text-xs text-[var(--bt-muted)]">
          What it is for
          <input name="title" placeholder="Signing deposit" className={FIELD} style={{ borderColor: "var(--bt-border)" }} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-[var(--bt-muted)]">
          Amount
          <input name="amount" placeholder="0.00" inputMode="decimal" className={FIELD} style={{ borderColor: "var(--bt-border)" }} />
        </label>
        <button type="submit" disabled={pending} className={PRIMARY} style={{ background: "var(--bt-primary)" }}>
          {pending ? "Saving…" : "Request"}
        </button>
        <Err state={state} />
      </form>
    </details>
  );
}

export function DepositActions({
  jobId,
  depositId,
  status,
  invoices,
}: {
  jobId: string;
  depositId: string;
  status: string;
  invoices: readonly OpenInvoiceOption[];
}) {
  const [receiveState, receiveAction, receiving] = useActionState(receiveDepositAction, INITIAL);
  const [applyState, applyAction, applying] = useActionState(applyDepositAction, INITIAL);
  const [refundState, refundAction, refunding] = useActionState(refundDepositAction, INITIAL);

  const hidden = (
    <>
      <input type="hidden" name="jobId" value={jobId} />
      <input type="hidden" name="depositId" value={depositId} />
    </>
  );

  if (status === "APPLIED" || status === "REFUNDED") {
    return <span className="text-xs text-[var(--bt-muted)]">—</span>;
  }

  return (
    <div className="flex flex-col items-start gap-1.5">
      {status === "REQUESTED" ? (
        <form action={receiveAction} className="flex flex-wrap items-center gap-1.5">
          {hidden}
          <select name="method" defaultValue="MANUAL" className={FIELD} style={{ borderColor: "var(--bt-border)" }}>
            <option value="MANUAL">Check / cash</option>
            <option value="STRIPE_CARD">Card</option>
            <option value="STRIPE_ACH">ACH</option>
          </select>
          <input name="reference" placeholder="Check #" className={`${FIELD} w-24`} style={{ borderColor: "var(--bt-border)" }} />
          <button type="submit" disabled={receiving} className={PRIMARY} style={{ background: "var(--bt-primary)" }}>
            {receiving ? "Saving…" : "Mark received"}
          </button>
          <Err state={receiveState} />
        </form>
      ) : (
        <form action={applyAction} className="flex flex-wrap items-center gap-1.5">
          {hidden}
          <InvoicePicker invoices={invoices} />
          <button type="submit" disabled={applying} className={PRIMARY} style={{ background: "var(--bt-primary)" }}>
            {applying ? "Applying…" : "Apply to invoice"}
          </button>
          <Err state={applyState} />
        </form>
      )}
      <form action={refundAction}>
        {hidden}
        <button type="submit" disabled={refunding} className={SECONDARY} style={{ borderColor: "var(--bt-border)" }}>
          {refunding ? "Refunding…" : "Refund"}
        </button>
        <Err state={refundState} />
      </form>
    </div>
  );
}
