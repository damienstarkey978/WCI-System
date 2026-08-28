"use client";

import { voidInvoiceAction } from "./actions";

/** Voiding is a soft-delete guard against fat-fingered create, not a common action — confirm first. */
export function VoidInvoiceButton({ jobId, invoiceId }: { jobId: string; invoiceId: string }) {
  return (
    <form
      action={voidInvoiceAction}
      onSubmit={(event) => {
        if (!confirm("Void this invoice? This cannot be undone.")) event.preventDefault();
      }}
    >
      <input type="hidden" name="jobId" value={jobId} />
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <button type="submit" className="text-xs text-[var(--bt-muted)] hover:text-red-600 hover:underline">
        Void
      </button>
    </form>
  );
}
