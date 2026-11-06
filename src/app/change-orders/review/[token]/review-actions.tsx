"use client";

import { useActionState } from "react";

import {
  approveChangeOrderReviewAction,
  declineChangeOrderReviewAction,
  type ActionState,
} from "./actions";

const INITIAL: ActionState = {};

export function ChangeOrderReviewActions({
  token,
  alreadyDecided,
  status,
}: {
  token: string;
  alreadyDecided: boolean;
  status: string;
}) {
  const [approveState, approveAction, approvePending] = useActionState(approveChangeOrderReviewAction, INITIAL);
  const [declineState, declineAction, declinePending] = useActionState(declineChangeOrderReviewAction, INITIAL);

  if (alreadyDecided || approveState.ok || declineState.ok || declineState.declined) {
    const declined = declineState.declined || status === "DECLINED";
    return (
      <div
        className="rounded-lg border px-4 py-3 text-sm"
        style={{
          borderColor: declined ? "#fecaca" : "#bbf7d0",
          background: declined ? "#fef2f2" : "#f0fdf4",
          color: declined ? "#991b1b" : "#166534",
        }}
      >
        {declined ? "You declined this change order. Thank you." : "Thank you — this change order is approved."}
      </div>
    );
  }

  const error = approveState.error ?? declineState.error;

  return (
    <div className="flex flex-col gap-4">
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <form action={approveAction} className="flex flex-col gap-3 rounded-lg border bg-white p-4" style={{ borderColor: "#e5e7eb" }}>
        <input type="hidden" name="token" value={token} />
        <label className="grid gap-1 text-sm">
          <span className="text-xs font-medium text-[#6b7280]">Type your full name to sign</span>
          <input
            name="clientSignatureName"
            required
            autoComplete="name"
            className="rounded border px-3 py-2 text-sm outline-none focus:border-[#0f4c81]"
            style={{ borderColor: "#d1d5db" }}
            placeholder="Full legal name"
          />
        </label>
        <button
          type="submit"
          disabled={approvePending || declinePending}
          className="rounded px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          style={{ background: "#0f4c81" }}
        >
          {approvePending ? "Approving…" : "Approve & sign"}
        </button>
      </form>
      <form action={declineAction}>
        <input type="hidden" name="token" value={token} />
        <button
          type="submit"
          disabled={approvePending || declinePending}
          className="text-sm font-medium text-[#6b7280] underline hover:text-red-600 disabled:opacity-50"
        >
          {declinePending ? "Declining…" : "Decline this change order"}
        </button>
      </form>
    </div>
  );
}
