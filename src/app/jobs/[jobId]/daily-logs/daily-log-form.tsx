"use client";

import { useActionState, useEffect, useRef, useState } from "react";

import { createDailyLogAction, draftDailyLogNoteAction, type ActionState, type DraftDailyLogActionState } from "./actions";

const INITIAL: ActionState = {};
const DRAFT_INITIAL: DraftDailyLogActionState = {};

/**
 * "Draft with AI" (handoff-ai-analysis-and-jarvis-deep-integration-spec.md Part
 * 3.3a) — snap a photo, jot a quick note, and Jarvis writes the log entry for
 * review before it's saved. Deliberately its own small form nested inside the real
 * one: drafting never submits a DailyLog, only fills the note textarea below.
 */
function DraftWithAi({ noteRef }: { noteRef: React.RefObject<HTMLTextAreaElement | null> }) {
  const [draftState, draftAction, draftPending] = useActionState(draftDailyLogNoteAction, DRAFT_INITIAL);
  const [rough, setRough] = useState("");
  const photosRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (draftState.draft && noteRef.current) {
      noteRef.current.value = draftState.draft;
    }
    // Only re-sync the (uncontrolled) note textarea when a *new* draft comes back —
    // not on every render, so it doesn't stomp on further hand-edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftState.draft]);

  return (
    <div className="mb-3 rounded border border-dashed p-2.5" style={{ borderColor: "var(--bt-border)" }}>
      <div className="mb-1.5 text-xs font-semibold text-[var(--bt-muted)]">Draft with AI</div>
      <form action={draftAction} className="flex flex-col gap-1.5">
        <textarea
          name="notes"
          value={rough}
          onChange={(event) => setRough(event.target.value)}
          rows={2}
          placeholder="Quick note — e.g. 'framing crew finished 2nd floor walls, waiting on inspection'"
          className="w-full rounded border px-2.5 py-1.5 text-sm outline-none focus:border-[var(--bt-primary)]"
          style={{ borderColor: "var(--bt-border)" }}
        />
        <div className="flex items-center gap-2">
          <input ref={photosRef} type="file" name="photos" multiple accept="image/jpeg,image/png,image/webp,image/gif" className="flex-1 text-xs" />
          <button
            type="submit"
            disabled={draftPending || rough.trim().length < 5}
            className="rounded border px-3 py-1.5 text-xs font-semibold text-[var(--bt-text)] disabled:opacity-50"
            style={{ borderColor: "var(--bt-border)" }}
          >
            {draftPending ? "Drafting…" : "Draft entry"}
          </button>
        </div>
      </form>
      {draftState.error ? <p className="mt-1 text-xs text-red-600">{draftState.error}</p> : null}
      {draftState.draft ? <p className="mt-1 text-xs text-[var(--bt-muted)]">Drafted below — review and edit before saving.</p> : null}
    </div>
  );
}

export function DailyLogForm({ jobId, aiEnabled }: { jobId: string; aiEnabled?: boolean }) {
  const [state, formAction, pending] = useActionState(createDailyLogAction, INITIAL);
  const formRef = useRef<HTMLFormElement>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);

  return (
    <form
      ref={formRef}
      action={async (formData) => {
        await formAction(formData);
        formRef.current?.reset();
      }}
      className="rounded-lg border bg-[var(--bt-panel-bg)] p-4"
      style={{ borderColor: "var(--bt-border)" }}
    >
      <input type="hidden" name="jobId" value={jobId} />

      {aiEnabled ? <DraftWithAi noteRef={noteRef} /> : null}

      <label className="grid gap-1 text-sm">
        <span className="text-xs font-medium text-[var(--bt-muted)]">New daily log</span>
        <textarea
          ref={noteRef}
          name="note"
          required
          rows={3}
          placeholder="What happened on site today?"
          className="w-full rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]"
          style={{ borderColor: "var(--bt-border)" }}
        />
      </label>

      <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-[var(--bt-muted)]">
        <label className="flex items-center gap-1.5">
          <input type="checkbox" name="clientVisible" defaultChecked />
          Visible to client
        </label>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" name="subVisible" defaultChecked />
          Visible to subs
        </label>
      </div>

      {state.error ? (
        <p role="alert" className="mt-2 text-xs text-red-600">
          {state.error}
        </p>
      ) : null}

      <div className="mt-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded px-4 py-2 text-sm font-semibold text-[var(--bt-on-primary)] disabled:opacity-50"
          style={{ background: "var(--bt-primary)" }}
        >
          {pending ? "Saving…" : "Add log"}
        </button>
      </div>
    </form>
  );
}
