"use client";

import { useActionState, useState } from "react";

import {
  deleteTestJarvisPhotoQaLeadAction,
  runCostCodeFixAction,
  runJarvis403CheckAction,
  type CostCodeFixActionState,
  type DeleteTestLeadActionState,
  type Jarvis403ActionState,
} from "./actions";

const PANEL = "rounded-lg border border-black/10 p-4 dark:border-white/15";
const BUTTON = "rounded bg-black px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black";
const CANCEL_BUTTON = "rounded border border-black/20 px-3 py-1.5 text-sm font-medium disabled:opacity-50 dark:border-white/25";

/**
 * An inline two-step confirm instead of window.confirm() — a native confirm()
 * dialog blocks the tab's entire main thread until dismissed, which is fine for a
 * person clicking through it but reproducibly hangs any browser-automation tool
 * that doesn't have a JS-dialog handler wired up (confirmed against this exact
 * page: "Run the fix" appeared to freeze the tab because the dialog was sitting
 * there with nothing to dismiss it). This never opens a native dialog at all.
 */
function useTwoStepConfirm() {
  const [armed, setArmed] = useState(false);
  return {
    armed,
    arm: () => setArmed(true),
    disarm: () => setArmed(false),
  };
}

const INITIAL_JARVIS_STATE: Jarvis403ActionState = {};

export function JarvisIsolationPanel() {
  const [state, formAction, pending] = useActionState(runJarvis403CheckAction, INITIAL_JARVIS_STATE);

  return (
    <div className={PANEL}>
      <h2 className="text-sm font-semibold">Jarvis API isolation check</h2>
      <p className="mt-1 text-xs text-black/60 dark:text-white/60">
        Runs 5 real calls against this server&apos;s actual configured Anthropic API key — the same key and runtime
        production Jarvis uses. Costs a little and takes a few seconds.
      </p>
      <form action={formAction} className="mt-3">
        <button type="submit" disabled={pending} className={BUTTON}>
          {pending ? "Running…" : "Run isolation check"}
        </button>
      </form>

      {state.error ? <p className="mt-3 text-sm text-red-600">{state.error}</p> : null}

      {state.results ? (
        <div className="mt-3 flex flex-col gap-1.5 font-mono text-xs">
          {state.results.map((result) => (
            <div key={result.label} className={result.ok ? "text-green-700 dark:text-green-400" : "text-red-600"}>
              {result.ok ? "ok  " : "FAIL"} {result.label}
              {result.detail ? ` — ${result.detail}` : ""}
            </div>
          ))}
          <p className="mt-2 font-sans text-black/60 dark:text-white/60">
            Whichever is the FIRST to fail is where the 403 comes from. If all five fail identically, that points at
            the API key/account, not the request.
          </p>
        </div>
      ) : null}
    </div>
  );
}

const INITIAL_FIX_STATE: CostCodeFixActionState = {};

export function CostCodeFixButton({ looksBad }: { looksBad: boolean }) {
  const [state, formAction, pending] = useActionState(runCostCodeFixAction, INITIAL_FIX_STATE);
  const confirmStep = useTwoStepConfirm();

  if (confirmStep.armed) {
    return (
      <form action={formAction} className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-sm">Repair cost code catalog codes/parent links in place? This writes to production.</span>
        <button type="submit" disabled={pending} className={BUTTON}>
          {pending ? "Fixing…" : "Yes, run the fix"}
        </button>
        <button type="button" disabled={pending} onClick={confirmStep.disarm} className={CANCEL_BUTTON}>
          Cancel
        </button>
      </form>
    );
  }

  return (
    <div className="mt-3">
      <button type="button" onClick={confirmStep.arm} disabled={!looksBad} className={BUTTON}>
        Run the fix
      </button>
      {!looksBad ? <span className="ml-2 text-xs text-black/50 dark:text-white/50">Nothing looks wrong — button disabled.</span> : null}
      {state.summary ? <p className="mt-2 text-sm text-green-700 dark:text-green-400">{state.summary}</p> : null}
      {state.error ? <p className="mt-2 text-sm text-red-600">{state.error}</p> : null}
      {state.unmatchedLiveRows && state.unmatchedLiveRows.length > 0 ? (
        <div className="mt-3">
          <p className="text-xs font-medium">Live rows not in the canonical list (left untouched):</p>
          <div className="mt-1 max-h-48 overflow-y-auto rounded border border-black/10 font-mono text-xs dark:border-white/15">
            {state.unmatchedLiveRows.map((row) => (
              <div key={row.id} className="border-b border-black/5 px-2 py-1 last:border-0 dark:border-white/10">
                {row.id} — code={JSON.stringify(row.code)} name={JSON.stringify(row.name)}
              </div>
            ))}
          </div>
        </div>
      ) : null}
      {state.notFoundNames && state.notFoundNames.length > 0 ? (
        <div className="mt-3">
          <p className="text-xs font-medium">Canonical names not found live (need creating by hand):</p>
          <div className="mt-1 max-h-48 overflow-y-auto rounded border border-black/10 font-mono text-xs dark:border-white/15">
            {state.notFoundNames.map((name) => (
              <div key={name} className="border-b border-black/5 px-2 py-1 last:border-0 dark:border-white/10">
                {name}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

const INITIAL_DELETE_STATE: DeleteTestLeadActionState = {};

export function DeleteTestLeadButton({ hasRecords }: { hasRecords: boolean }) {
  const [state, formAction, pending] = useActionState(deleteTestJarvisPhotoQaLeadAction, INITIAL_DELETE_STATE);
  const confirmStep = useTwoStepConfirm();

  if (!hasRecords && !state.summary) {
    return <p className="mt-3 text-sm text-black/60 dark:text-white/60">Nothing found — already cleaned up, or never created here.</p>;
  }

  if (confirmStep.armed) {
    return (
      <form action={formAction} className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-sm">Delete the &quot;TEST Jarvis PhotoQA&quot; client/lead? This cannot be undone.</span>
        <button type="submit" disabled={pending} className={BUTTON}>
          {pending ? "Deleting…" : "Yes, delete"}
        </button>
        <button type="button" disabled={pending} onClick={confirmStep.disarm} className={CANCEL_BUTTON}>
          Cancel
        </button>
      </form>
    );
  }

  return (
    <div className="mt-3">
      <button type="button" onClick={confirmStep.arm} disabled={!hasRecords} className={BUTTON}>
        Delete test records
      </button>
      {state.summary ? <p className="mt-2 text-sm text-green-700 dark:text-green-400">{state.summary}</p> : null}
      {state.error ? <p className="mt-2 text-sm text-red-600">{state.error}</p> : null}
    </div>
  );
}
