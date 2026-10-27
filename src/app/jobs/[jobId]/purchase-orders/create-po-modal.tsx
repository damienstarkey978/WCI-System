"use client";

import { useState } from "react";

import type { CostCodeOption } from "@/components/financial/CostCodeLineItems";

import { CreatePoForm, type VendorOption } from "./create-po-form";

/**
 * Opens the Buildertrend-sized Purchase Order create dialog from "+ Purchase Order".
 */
export function CreatePoModal({
  jobId,
  jobName,
  costCodes,
  vendors,
  suggestedPoNumber,
  defaultScopeOfWork,
  triggerLabel = "+ Purchase Order",
}: {
  jobId: string;
  jobName: string;
  costCodes: readonly CostCodeOption[];
  vendors: readonly VendorOption[];
  suggestedPoNumber: string;
  defaultScopeOfWork: string;
  triggerLabel?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded px-4 py-2 text-sm font-semibold text-[var(--bt-on-primary)]"
        style={{ background: "var(--bt-primary)" }}
      >
        {triggerLabel}
      </button>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-3">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div
            className="relative flex max-h-[96vh] w-full max-w-5xl flex-col overflow-hidden rounded-t-lg bg-[var(--bt-panel-bg)] shadow-xl sm:max-h-[92vh] sm:rounded-lg"
            role="dialog"
            aria-modal="true"
            aria-label="Purchase Order"
          >
            <CreatePoForm
              jobId={jobId}
              jobName={jobName}
              costCodes={costCodes}
              vendors={vendors}
              suggestedPoNumber={suggestedPoNumber}
              defaultScopeOfWork={defaultScopeOfWork}
              onClose={() => setOpen(false)}
            />
          </div>
        </div>
      ) : null}
    </>
  );
}
