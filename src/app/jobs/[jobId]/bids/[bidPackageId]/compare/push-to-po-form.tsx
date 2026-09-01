"use client";

import { useActionState, useState } from "react";

import type { CostCodeOption } from "@/components/financial/CostCodeLineItems";

import { pushBidToPurchaseOrderAction, type ActionState } from "./actions";

const INITIAL: ActionState = {};

export function PushToPoForm({
  jobId,
  bidPackageId,
  bidSubmissionId,
  costCodes,
}: {
  jobId: string;
  bidPackageId: string;
  bidSubmissionId: string;
  costCodes: readonly CostCodeOption[];
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(pushBidToPurchaseOrderAction, INITIAL);

  if (state.ok) {
    return <p className="text-xs font-medium text-[var(--bt-text)]">Pushed to a purchase order.</p>;
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-xs font-medium text-[var(--bt-primary)] hover:underline">
        Push to PO
      </button>
    );
  }

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="jobId" value={jobId} />
      <input type="hidden" name="bidPackageId" value={bidPackageId} />
      <input type="hidden" name="bidSubmissionId" value={bidSubmissionId} />
      <input
        name="poNumber"
        placeholder="PO #"
        required
        className="w-24 rounded border px-2 py-1 text-xs outline-none focus:border-[var(--bt-primary)]"
        style={{ borderColor: "var(--bt-border)" }}
      />
      <select
        name="fallbackCostCodeId"
        defaultValue=""
        className="rounded border px-2 py-1 text-xs outline-none focus:border-[var(--bt-primary)]"
        style={{ borderColor: "var(--bt-border)" }}
      >
        <option value="">Fallback cost code (if needed)</option>
        {costCodes.map((code) => (
          <option key={code.id} value={code.id}>
            {code.code} — {code.name}
          </option>
        ))}
      </select>
      <button
        type="submit"
        disabled={pending}
        className="rounded px-2 py-1 text-xs font-semibold text-[var(--bt-on-primary)] disabled:opacity-50"
        style={{ background: "var(--bt-primary)" }}
      >
        {pending ? "Pushing…" : "Push"}
      </button>
      {state.error ? (
        <p role="alert" className="w-full text-xs text-red-600">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
