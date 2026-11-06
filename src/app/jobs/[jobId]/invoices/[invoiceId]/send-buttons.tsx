"use client";

import { useActionState } from "react";

import { resendInvoiceAction, sendInvoiceAction, type ActionState } from "../credit-deposit-actions";

const INITIAL: ActionState = {};

function SendIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden>
      <path d="M3.1 2.3a1 1 0 0 1 1.08-.12l13 6.5a1 1 0 0 1 0 1.84l-13 6.5A1 1 0 0 1 2 16.5v-4.3a1 1 0 0 1 .7-.95l6.55-2.05a.25.25 0 0 0 0-.48L2.7 6.67A1 1 0 0 1 2 5.72V3.1a1 1 0 0 1 1.1-.8Z" />
    </svg>
  );
}

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
 *
 * `variant="bt"` matches Buildertrend footer: solid primary with paper-plane icon.
 */
export function SendInvoiceButtons({
  jobId,
  invoiceId,
  status,
  variant = "default",
}: {
  jobId: string;
  invoiceId: string;
  status: string;
  variant?: "default" | "bt";
}) {
  const [sendState, sendAction, sending] = useActionState(sendInvoiceAction, INITIAL);
  const [resendState, resendAction, resending] = useActionState(resendInvoiceAction, INITIAL);

  if (status === "VOID") return null;

  const hidden = (
    <>
      <input type="hidden" name="jobId" value={jobId} />
      <input type="hidden" name="invoiceId" value={invoiceId} />
    </>
  );

  const btPrimary =
    "inline-flex items-center gap-1.5 rounded px-4 py-2 text-sm font-semibold text-[var(--bt-on-primary)] disabled:opacity-50";
  const defaultPrimary = "rounded px-3 py-1.5 text-xs font-semibold text-[var(--bt-on-primary)] disabled:opacity-50";
  const defaultSecondary =
    "rounded border px-3 py-1.5 text-xs font-semibold text-[var(--bt-text)] disabled:opacity-50 hover:bg-black/5";

  if (status === "DRAFT") {
    return (
      <form action={sendAction}>
        {hidden}
        <button
          type="submit"
          disabled={sending}
          className={variant === "bt" ? btPrimary : defaultPrimary}
          style={{ background: "var(--bt-primary)" }}
        >
          {variant === "bt" ? <SendIcon /> : null}
          {sending ? "Sending…" : "Send"}
        </button>
        <Err state={sendState} />
      </form>
    );
  }

  return (
    <form action={resendAction}>
      {hidden}
      <button
        type="submit"
        disabled={resending}
        className={variant === "bt" ? btPrimary : defaultSecondary}
        style={
          variant === "bt"
            ? { background: "var(--bt-primary)" }
            : { borderColor: "var(--bt-border)" }
        }
      >
        {variant === "bt" ? <SendIcon /> : null}
        {resending ? "Sending…" : "Resend"}
      </button>
      <Err state={resendState} />
    </form>
  );
}
