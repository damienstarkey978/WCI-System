"use client";

import { useActionState, useState } from "react";

import { CostCodeLineItems, type CostCodeOption } from "@/components/financial/CostCodeLineItems";

import { replaceChangeOrderLinesAction, setChangeOrderFlatAction, type ActionState } from "../actions";

const INITIAL: ActionState = {};

const fieldClass = "rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]";
const fieldStyle = { borderColor: "var(--bt-border)" } as const;

/**
 * Buildertrend detail empty-state / add controls: + Add line item and + Add flat fee.
 * Only rendered when the change order is still editable.
 */
export function ChangeOrderLineItemsEditor({
  jobId,
  changeOrderId,
  costCodes,
  hasLines,
}: {
  jobId: string;
  changeOrderId: string;
  costCodes: readonly CostCodeOption[];
  hasLines: boolean;
}) {
  const [panel, setPanel] = useState<"none" | "lines" | "flat">(hasLines ? "none" : "none");
  const [linesState, linesAction, linesPending] = useActionState(replaceChangeOrderLinesAction, INITIAL);
  const [flatState, flatAction, flatPending] = useActionState(setChangeOrderFlatAction, INITIAL);

  return (
    <div className="flex flex-col gap-3">
      {!hasLines && panel === "none" ? (
        <div className="rounded border px-4 py-8 text-center" style={{ borderColor: "var(--bt-border)" }}>
          <p className="text-sm font-semibold text-[var(--bt-text)]">No line items yet</p>
          <p className="mt-1 text-xs text-[var(--bt-muted)]">Add line items to estimate the cost of this change order.</p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => setPanel("lines")}
              className="rounded px-3 py-1.5 text-sm font-semibold text-[var(--bt-on-primary)]"
              style={{ background: "var(--bt-primary)" }}
            >
              + Add line item
            </button>
            <button
              type="button"
              onClick={() => setPanel("flat")}
              className="rounded border px-3 py-1.5 text-sm font-semibold text-[var(--bt-primary)]"
              style={{ borderColor: "var(--bt-primary)" }}
            >
              + Add flat fee
            </button>
          </div>
        </div>
      ) : null}

      {hasLines && panel === "none" ? (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setPanel("lines")}
            className="text-sm font-medium text-[var(--bt-primary)] hover:underline"
          >
            + Add line item
          </button>
          <button
            type="button"
            onClick={() => setPanel("flat")}
            className="text-sm font-medium text-[var(--bt-primary)] hover:underline"
          >
            + Add flat fee
          </button>
        </div>
      ) : null}

      {panel === "lines" ? (
        <form action={linesAction} className="flex flex-col gap-3 rounded border p-3" style={{ borderColor: "var(--bt-border)" }}>
          <input type="hidden" name="jobId" value={jobId} />
          <input type="hidden" name="changeOrderId" value={changeOrderId} />
          <p className="text-xs text-[var(--bt-muted)]">
            {hasLines ? "Replaces existing line items with the rows below." : "Save to attach these lines to the change order."}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-sm">
              <span className="text-xs font-medium text-[var(--bt-muted)]">Markup / margin</span>
              <select name="rateMode" defaultValue="MARKUP" className={fieldClass} style={fieldStyle}>
                <option value="MARKUP">Markup</option>
                <option value="MARGIN">Margin</option>
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-xs font-medium text-[var(--bt-muted)]">Rate %</span>
              <input name="rate" inputMode="decimal" placeholder="0" className={fieldClass} style={fieldStyle} />
            </label>
          </div>
          <CostCodeLineItems costCodes={costCodes} />
          {linesState.error ? <p className="text-xs text-red-600">{linesState.error}</p> : null}
          {linesState.ok ? <p className="text-xs text-green-700">Line items saved.</p> : null}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setPanel("none")}
              className="rounded border px-3 py-1.5 text-sm font-semibold"
              style={{ borderColor: "var(--bt-border)" }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={linesPending}
              className="rounded px-3 py-1.5 text-sm font-semibold text-[var(--bt-on-primary)] disabled:opacity-50"
              style={{ background: "var(--bt-primary)" }}
            >
              {linesPending ? "Saving…" : "Save line items"}
            </button>
          </div>
        </form>
      ) : null}

      {panel === "flat" ? (
        <form action={flatAction} className="flex flex-col gap-3 rounded border p-3" style={{ borderColor: "var(--bt-border)" }}>
          <input type="hidden" name="jobId" value={jobId} />
          <input type="hidden" name="changeOrderId" value={changeOrderId} />
          <p className="text-xs text-[var(--bt-muted)]">Sets this change order to a single flat fee (removes itemized lines).</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="grid gap-1 text-sm">
              <span className="text-xs font-medium text-[var(--bt-muted)]">Cost code</span>
              <select name="flatCostCodeId" required defaultValue="" className={fieldClass} style={fieldStyle}>
                <option value="" disabled>
                  Choose
                </option>
                {costCodes.map((code) => (
                  <option key={code.id} value={code.id}>
                    {code.code} — {code.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-xs font-medium text-[var(--bt-muted)]">Builder cost</span>
              <input name="flatCost" inputMode="decimal" placeholder="0.00" required className={fieldClass} style={fieldStyle} />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="text-xs font-medium text-[var(--bt-muted)]">Client price</span>
              <input name="flatClientPrice" inputMode="decimal" placeholder="0.00" required className={fieldClass} style={fieldStyle} />
            </label>
          </div>
          {flatState.error ? <p className="text-xs text-red-600">{flatState.error}</p> : null}
          {flatState.ok ? <p className="text-xs text-green-700">Flat fee saved.</p> : null}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setPanel("none")}
              className="rounded border px-3 py-1.5 text-sm font-semibold"
              style={{ borderColor: "var(--bt-border)" }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={flatPending}
              className="rounded px-3 py-1.5 text-sm font-semibold text-[var(--bt-on-primary)] disabled:opacity-50"
              style={{ background: "var(--bt-primary)" }}
            >
              {flatPending ? "Saving…" : "Save flat fee"}
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
