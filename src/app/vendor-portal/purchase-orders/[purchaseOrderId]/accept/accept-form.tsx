"use client";

import { useActionState } from "react";

import { acceptPurchaseOrderAction, type AcceptActionState } from "./actions";

const INITIAL: AcceptActionState = {};

export function AcceptPurchaseOrderForm({
  purchaseOrderId,
  token,
  defaultName,
}: {
  purchaseOrderId: string;
  token: string | null;
  defaultName: string;
}) {
  const [state, formAction, pending] = useActionState(acceptPurchaseOrderAction, INITIAL);

  if (state.ok) {
    return (
      <div className="rounded-lg border p-4" style={{ borderColor: "var(--bt-border)", background: "var(--bt-status-open-bg)" }}>
        <p className="text-sm font-semibold" style={{ color: "var(--bt-status-open-text)" }}>
          Purchase order accepted. Thank you.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-lg border bg-[var(--bt-panel-bg)] p-4" style={{ borderColor: "var(--bt-border)" }}>
      <input type="hidden" name="purchaseOrderId" value={purchaseOrderId} />
      {token ? <input type="hidden" name="token" value={token} /> : null}

      <label className="grid gap-1 text-sm">
        <span className="text-xs font-medium text-[var(--bt-muted)]">Type your full name to e-sign</span>
        <input
          name="signatureName"
          required
          defaultValue={defaultName}
          className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]"
          style={{ borderColor: "var(--bt-border)" }}
        />
      </label>

      {state.error ? (
        <p role="alert" className="text-xs text-red-600">
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="self-start rounded px-4 py-2 text-sm font-semibold text-[var(--bt-on-primary)] disabled:opacity-50"
        style={{ background: "var(--bt-primary)" }}
      >
        {pending ? "Accepting…" : "Accept purchase order"}
      </button>
    </form>
  );
}
