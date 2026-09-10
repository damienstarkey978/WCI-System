"use client";

import { useActionState } from "react";

import { resendInvoiceAction, sendInvoiceAction, type ActionState } from "../credit-deposit-actions";

const INITIAL: ActionState = {};
const PRIMARY = "rounded px-3 py-1.5 text-xs font-semibold text-[var(--bt-on-primary)] disabled:opacity-50";
const SECONDARY =
  "rounded border px-3 py-1.5 text-xs font-semibold text-[var(--bt-text)] disabled:opacity-50 hover:bg-black/5";

function Err({ state }: { state: ActionState }) {
  if (!state.error) return null;
  return (
    <p role="alert" className="mt-1 text-xs" style={{ color: "var(--bt-danger)" }}>
      {state.error}
    </p>
  );
}

/**
 * Send is the transition that makes an invoice count toward amountInvoiced. Resend
 * is a second copy of the same demand — it records that it went out again and
 * deliberately leaves the dates alone.
 */
export function SendInvoiceButtons({ jobId, invoiceId, status }: { jobId: string; invoiceId: string; status: string }) {
  const [sendState, sendAction, sending] = useActionState(sendInvoiceAction, INITIAL);
  const [resendState, resendAction, resending] = useActionState(resendInvoiceAction, INITIAL);

  if (status === "VOID") return null;

  const hidden = (
    <>
      <input type="hidden" name="jobId" value={jobId} />
      <input type="hidden" name="invoiceId" value={invoiceId} />
    </>
  );

  if (status === "DRAFT") {
    return (
      <form action={sendAction}>
        {hidden}
        <button type="submit" disabled={sending} className={PRIMARY} style={{ background: "var(--bt-primary)" }}>
          {sending ? "Sending…" : "Send to client"}
        </button>
        <Err state={sendState} />
      </form>
    );
  }

  return (
    <form action={resendAction}>
      {hidden}
      <button type="submit" disabled={resending} className={SECONDARY} style={{ borderColor: "var(--bt-border)" }}>
        {resending ? "Sending…" : "Resend"}
      </button>
      <Err state={resendState} />
    </form>
  );
}
