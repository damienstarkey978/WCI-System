"use client";

import { useActionState } from "react";

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

  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        if (!confirm("Repair cost code catalog codes/parent links in place? This writes to production.")) event.preventDefault();
      }}
      className="mt-3"
    >
      <button type="submit" disabled={pending || !looksBad} className={BUTTON}>
        {pending ? "Fixing…" : "Run the fix"}
      </button>
      {!looksBad ? <span className="ml-2 text-xs text-black/50 dark:text-white/50">Nothing looks wrong — button disabled.</span> : null}
      {state.summary ? <p className="mt-2 text-sm text-green-700 dark:text-green-400">{state.summary}</p> : null}
      {state.error ? <p className="mt-2 text-sm text-red-600">{state.error}</p> : null}
    </form>
  );
}

const INITIAL_DELETE_STATE: DeleteTestLeadActionState = {};

export function DeleteTestLeadButton({ hasRecords }: { hasRecords: boolean }) {
  const [state, formAction, pending] = useActionState(deleteTestJarvisPhotoQaLeadAction, INITIAL_DELETE_STATE);

  if (!hasRecords && !state.summary) {
    return <p className="mt-3 text-sm text-black/60 dark:text-white/60">Nothing found — already cleaned up, or never created here.</p>;
  }

  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        if (!confirm('Delete the "TEST Jarvis PhotoQA" client/lead? This cannot be undone.')) event.preventDefault();
      }}
      className="mt-3"
    >
      <button type="submit" disabled={pending || !hasRecords} className={BUTTON}>
        {pending ? "Deleting…" : "Delete test records"}
      </button>
      {state.summary ? <p className="mt-2 text-sm text-green-700 dark:text-green-400">{state.summary}</p> : null}
      {state.error ? <p className="mt-2 text-sm text-red-600">{state.error}</p> : null}
    </form>
  );
}
