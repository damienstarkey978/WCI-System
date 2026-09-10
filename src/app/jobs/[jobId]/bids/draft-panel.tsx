"use client";

import { useActionState } from "react";

import { addScopeLineAction, releaseBidPackageAction, type ActionState } from "./actions";

const INITIAL: ActionState = {};
const FIELD = "rounded border px-2 py-1.5 text-xs outline-none focus:border-[var(--bt-primary)]";

function Err({ state }: { state: ActionState }) {
  if (!state.error) return null;
  return (
    <p role="alert" className="mt-1 text-xs" style={{ color: "var(--bt-danger)" }}>
      {state.error}
    </p>
  );
}

/**
 * What you can do to a package that hasn't gone out yet: keep adding scope, then
 * release it. Both disappear once it is released — changing what was asked for after
 * subs have started pricing means their numbers no longer answer the same question,
 * and nothing tells them it changed.
 */
export function DraftPanel({
  jobId,
  bidPackageId,
  hasScope,
}: {
  jobId: string;
  bidPackageId: string;
  hasScope: boolean;
}) {
  const [addState, addAction, adding] = useActionState(addScopeLineAction, INITIAL);
  const [releaseState, releaseAction, releasing] = useActionState(releaseBidPackageAction, INITIAL);

  return (
    <div className="mt-3 flex flex-col gap-2 rounded border border-dashed p-3" style={{ borderColor: "var(--bt-border)" }}>
      <form action={addAction} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="jobId" value={jobId} />
        <input type="hidden" name="bidPackageId" value={bidPackageId} />
        <label className="grid min-w-40 flex-1 gap-1">
          <span className="text-[10px] text-[var(--bt-muted)]">Add scope line</span>
          <input name="scopeTitle" placeholder="Hang and finish drywall, level 4" className={FIELD} style={{ borderColor: "var(--bt-border)" }} />
        </label>
        <label className="grid w-20 gap-1">
          <span className="text-[10px] text-[var(--bt-muted)]">Qty</span>
          <input name="scopeQuantity" inputMode="decimal" className={FIELD} style={{ borderColor: "var(--bt-border)" }} />
        </label>
        <label className="grid w-20 gap-1">
          <span className="text-[10px] text-[var(--bt-muted)]">Unit</span>
          <input name="scopeUnit" placeholder="sq ft" className={FIELD} style={{ borderColor: "var(--bt-border)" }} />
        </label>
        <button
          type="submit"
          disabled={adding}
          className="rounded border px-3 py-1.5 text-xs font-semibold text-[var(--bt-text)] hover:bg-black/5 disabled:opacity-50"
          style={{ borderColor: "var(--bt-border)" }}
        >
          {adding ? "Adding…" : "Add"}
        </button>
        <Err state={addState} />
      </form>

      <form action={releaseAction} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="jobId" value={jobId} />
        <input type="hidden" name="bidPackageId" value={bidPackageId} />
        <button
          type="submit"
          disabled={releasing || !hasScope}
          title={hasScope ? undefined : "Add at least one scope line first"}
          className="rounded px-3 py-1.5 text-xs font-semibold text-[var(--bt-on-primary)] disabled:opacity-50"
          style={{ background: "var(--bt-primary)" }}
        >
          {releasing ? "Releasing…" : "Release to subs"}
        </button>
        <span className="text-[10px] text-[var(--bt-muted)]">
          {hasScope ? "Subs can be invited once this is released." : "Add a scope line before releasing."}
        </span>
        <Err state={releaseState} />
      </form>
    </div>
  );
}
