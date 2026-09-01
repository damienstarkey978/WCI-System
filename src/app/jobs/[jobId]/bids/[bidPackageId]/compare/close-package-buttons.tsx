"use client";

import { useActionState } from "react";

import { closeBidPackageAction, type ActionState } from "./actions";

const INITIAL: ActionState = {};

export function ClosePackageButtons({
  jobId,
  bidPackageId,
  hasAccepted,
}: {
  jobId: string;
  bidPackageId: string;
  hasAccepted: boolean;
}) {
  const [state, formAction, pending] = useActionState(closeBidPackageAction, INITIAL);

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2">
        <form action={formAction}>
          <input type="hidden" name="jobId" value={jobId} />
          <input type="hidden" name="bidPackageId" value={bidPackageId} />
          <input type="hidden" name="status" value="CLOSED" />
          <button
            type="submit"
            disabled={pending}
            className="rounded border px-3 py-1.5 text-xs font-medium text-[var(--bt-text)] disabled:opacity-50"
            style={{ borderColor: "var(--bt-border)" }}
          >
            Close package
          </button>
        </form>
        <form action={formAction}>
          <input type="hidden" name="jobId" value={jobId} />
          <input type="hidden" name="bidPackageId" value={bidPackageId} />
          <input type="hidden" name="status" value="AWARDED" />
          <button
            type="submit"
            disabled={pending || !hasAccepted}
            title={hasAccepted ? undefined : "Accept at least one submission first."}
            className="rounded px-3 py-1.5 text-xs font-semibold text-[var(--bt-on-primary)] disabled:opacity-50"
            style={{ background: "var(--bt-primary)" }}
          >
            Award package
          </button>
        </form>
      </div>
      {state.error ? (
        <p role="alert" className="text-xs text-red-600">
          {state.error}
        </p>
      ) : null}
    </div>
  );
}
