"use client";

import { useActionState } from "react";

import { pushTakeoffToPoAction, queueTakeoffPurchasingAction, type ActionState } from "./actions";

const INITIAL: ActionState = {};

export function TakeoffActionsPanel({
  jobId,
  takeoffId,
  queueableLineIds,
  pushableLineIds,
}: {
  jobId: string;
  takeoffId: string;
  queueableLineIds: readonly string[];
  pushableLineIds: readonly string[];
}) {
  const [queueState, queueAction, queuePending] = useActionState(queueTakeoffPurchasingAction, INITIAL);
  const [poState, poAction, poPending] = useActionState(pushTakeoffToPoAction, INITIAL);

  if (queueableLineIds.length === 0 && pushableLineIds.length === 0) {
    return (
      <p className="text-sm text-[var(--bt-muted)]">
        No convertible lines yet — attach plans, save measurements, and draft lines first. If every line is
        already ordered or cancelled, open Purchasing to track status.
      </p>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <form
        action={queueAction}
        className="flex flex-col gap-3 rounded-lg border p-4"
        style={{ borderColor: "var(--bt-border)", background: "var(--bt-panel-bg)" }}
      >
        <input type="hidden" name="jobId" value={jobId} />
        <input type="hidden" name="takeoffId" value={takeoffId} />
        {queueableLineIds.map((id) => (
          <input key={id} type="hidden" name="lineId" value={id} />
        ))}
        <h2 className="text-sm font-semibold text-[var(--bt-text)]">Send to Estimating</h2>
        <p className="text-xs text-[var(--bt-muted)]">
          {queueableLineIds.length === 0
            ? "No draft/ready lines left to queue."
            : `Queues ${queueableLineIds.length} line(s) for Estimating. Explicit only — AI draft never does this.`}
        </p>
        <label className="grid gap-1 text-sm">
          <span className="text-xs font-medium text-[var(--bt-muted)]">Vendor hint (optional)</span>
          <input
            name="vendorHint"
            disabled={queueableLineIds.length === 0}
            className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)] disabled:opacity-50"
            style={{ borderColor: "var(--bt-border)" }}
            placeholder="e.g. 84 Lumber"
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-xs font-medium text-[var(--bt-muted)]">Notes for Estimating (optional)</span>
          <textarea
            name="notes"
            rows={2}
            disabled={queueableLineIds.length === 0}
            className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)] disabled:opacity-50"
            style={{ borderColor: "var(--bt-border)" }}
          />
        </label>
        {queueState.error ? (
          <p role="alert" className="text-xs text-red-600">
            {queueState.error}
          </p>
        ) : null}
        {queueState.ok ? <p className="text-xs text-green-700">Queued for Estimating.</p> : null}
        <button
          type="submit"
          disabled={queuePending || queueableLineIds.length === 0}
          className="self-start rounded px-4 py-2 text-sm font-semibold text-[var(--bt-on-primary)] disabled:opacity-50"
          style={{ background: "var(--bt-primary)" }}
        >
          {queuePending ? "Queuing…" : "Send to Estimating"}
        </button>
      </form>

      <form
        action={poAction}
        className="flex flex-col gap-3 rounded-lg border p-4"
        style={{ borderColor: "var(--bt-border)", background: "var(--bt-panel-bg)" }}
      >
        <input type="hidden" name="jobId" value={jobId} />
        <input type="hidden" name="takeoffId" value={takeoffId} />
        {pushableLineIds.map((id) => (
          <input key={`po-${id}`} type="hidden" name="lineId" value={id} />
        ))}
        <h2 className="text-sm font-semibold text-[var(--bt-text)]">Push to Purchase Order</h2>
        <p className="text-xs text-[var(--bt-muted)]">
          {pushableLineIds.length === 0
            ? "No convertible lines left."
            : `Creates one DRAFT PO (sourceType=TAKEOFF) from ${pushableLineIds.length} line(s).`}
        </p>
        <label className="grid gap-1 text-sm">
          <span className="text-xs font-medium text-[var(--bt-muted)]">Vendor name</span>
          <input
            name="vendorName"
            required={pushableLineIds.length > 0}
            disabled={pushableLineIds.length === 0}
            className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)] disabled:opacity-50"
            style={{ borderColor: "var(--bt-border)" }}
          />
        </label>
        {poState.error ? (
          <p role="alert" className="text-xs text-red-600">
            {poState.error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={poPending || pushableLineIds.length === 0}
          className="self-start rounded border px-4 py-2 text-sm font-semibold disabled:opacity-50"
          style={{ borderColor: "var(--bt-primary)", color: "var(--bt-primary)" }}
        >
          {poPending ? "Creating PO…" : "Push to PO"}
        </button>
      </form>
    </div>
  );
}
