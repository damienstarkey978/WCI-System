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

/**
 * Calls a Server Action directly (not via <form action>) and tracks pending/result
 * with plain state, so a platform-level failure — the request never reaching this
 * server at all (a Netlify 503, a dropped connection) — surfaces as a real error
 * instead of leaving the button silently armed with no feedback. Confirmed against
 * production (2026-09-13): the previous <form action={formAction}> wiring, driven by
 * useActionState, has no error path at all for a failure below our own try/catch —
 * useActionState only ever updates state with what the action *returns*, so a 503
 * that stops the action from running just leaves the last state in place, which
 * looked from the screen alone like nothing happened. Same honesty principle as
 * assistant.ts's describePartialFailure: never let a failure read as silence.
 */
function useDirectServerAction<State extends { error?: string }>(
  action: (previous: State, formData: FormData) => Promise<State>,
  initialState: State,
) {
  const [state, setState] = useState<State>(initialState);
  const [pending, setPending] = useState(false);

  const run = async () => {
    setPending(true);
    try {
      const result = await action(state, new FormData());
      setState(result);
    } catch (error) {
      setState({
        ...state,
        error: `Request failed before completing: ${error instanceof Error ? error.message : String(error)}. This usually means a platform-level failure (e.g. a 503) rather than a problem with the action itself — nothing is confirmed changed; check status and try again.`,
      });
    } finally {
      setPending(false);
    }
  };

  return { state, pending, run };
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
  const { state, pending, run } = useDirectServerAction(runCostCodeFixAction, INITIAL_FIX_STATE);
  const confirmStep = useTwoStepConfirm();

  const handleConfirm = async () => {
    await run();
    confirmStep.disarm();
  };

  if (confirmStep.armed) {
    return (
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-sm">Repair cost code catalog codes/parent links in place? This writes to production.</span>
        <button type="button" disabled={pending} onClick={handleConfirm} className={BUTTON}>
          {pending ? "Fixing…" : "Yes, run the fix"}
        </button>
        <button type="button" disabled={pending} onClick={confirmStep.disarm} className={CANCEL_BUTTON}>
          Cancel
        </button>
      </div>
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
  const { state, pending, run } = useDirectServerAction(deleteTestJarvisPhotoQaLeadAction, INITIAL_DELETE_STATE);
  const confirmStep = useTwoStepConfirm();

  const handleConfirm = async () => {
    await run();
    confirmStep.disarm();
  };

  if (!hasRecords && !state.summary) {
    return <p className="mt-3 text-sm text-black/60 dark:text-white/60">Nothing found — already cleaned up, or never created here.</p>;
  }

  if (confirmStep.armed) {
    return (
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-sm">Delete the &quot;TEST Jarvis PhotoQA&quot; client/lead? This cannot be undone.</span>
        <button type="button" disabled={pending} onClick={handleConfirm} className={BUTTON}>
          {pending ? "Deleting…" : "Yes, delete"}
        </button>
        <button type="button" disabled={pending} onClick={confirmStep.disarm} className={CANCEL_BUTTON}>
          Cancel
        </button>
      </div>
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
