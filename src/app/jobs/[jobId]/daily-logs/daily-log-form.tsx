"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";

import { createDailyLogAction, draftDailyLogNoteAction, type ActionState, type DraftDailyLogActionState } from "./actions";

const INITIAL: ActionState = {};
const DRAFT_INITIAL: DraftDailyLogActionState = {};

/**
 * "Draft with AI" — own form, never nested inside the create form (invalid HTML
 * nesting was breaking submit / leaving Saving stuck once Jarvis UI was on).
 */
function DraftWithAi({ noteRef }: { noteRef: React.RefObject<HTMLTextAreaElement | null> }) {
  const [draftState, draftAction, draftPending] = useActionState(draftDailyLogNoteAction, DRAFT_INITIAL);
  const [rough, setRough] = useState("");

  useEffect(() => {
    if (draftState.draft && noteRef.current) {
      noteRef.current.value = draftState.draft;
    }
    // Only re-sync the (uncontrolled) note textarea when a *new* draft comes back.
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
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <input type="file" name="photos" multiple accept="image/jpeg,image/png,image/webp,image/gif" className="min-w-0 flex-1 text-xs" />
          <button
            type="submit"
            disabled={draftPending || rough.trim().length < 5}
            className="rounded border px-3 py-2 text-xs font-semibold text-[var(--bt-text)] disabled:opacity-50 sm:py-1.5"
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

export function DailyLogForm({
  jobId,
  aiEnabled,
  onSuccess,
}: {
  jobId: string;
  aiEnabled?: boolean;
  /** Called after a successful create so the parent can close the modal. */
  onSuccess?: () => void;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(createDailyLogAction, INITIAL);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const handledOk = useRef(false);

  useEffect(() => {
    if (!state.ok || handledOk.current) return;
    handledOk.current = true;
    onSuccess?.();
    router.refresh();
  }, [state.ok, onSuccess, router]);

  useEffect(() => {
    if (!state.ok) handledOk.current = false;
  }, [state.ok]);

  return (
    <div className="rounded-lg border bg-[var(--bt-panel-bg)] p-3 sm:p-4" style={{ borderColor: "var(--bt-border)" }}>
      {aiEnabled ? <DraftWithAi noteRef={noteRef} /> : null}

      <form action={formAction} className="flex flex-col gap-3">
        <input type="hidden" name="jobId" value={jobId} />

        <label className="grid gap-1 text-sm">
          <span className="text-xs font-medium text-[var(--bt-muted)]">Title</span>
          <input
            name="title"
            maxLength={200}
            placeholder="Prime walk thru"
            className="w-full rounded border px-3 py-2.5 text-base outline-none focus:border-[var(--bt-primary)] sm:py-2 sm:text-sm"
            style={{ borderColor: "var(--bt-border)" }}
          />
        </label>

        <label className="grid gap-1 text-sm">
          <span className="text-xs font-medium text-[var(--bt-muted)]">Notes</span>
          <textarea
            ref={noteRef}
            name="note"
            required
            rows={4}
            placeholder="What happened on site today?"
            className="w-full rounded border px-3 py-2.5 text-base outline-none focus:border-[var(--bt-primary)] sm:py-2 sm:text-sm"
            style={{ borderColor: "var(--bt-border)" }}
          />
        </label>

        <label className="grid gap-1 text-sm">
          <span className="text-xs font-medium text-[var(--bt-muted)]">Photos and files</span>
          <input type="file" name="attachments" multiple className="text-sm" />
        </label>

        <div className="flex flex-col gap-2 text-xs text-[var(--bt-muted)] sm:flex-row sm:flex-wrap sm:items-center sm:gap-4">
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
          <p role="alert" className="text-xs text-red-600">
            {state.error}
          </p>
        ) : null}

        <div>
          <button
            type="submit"
            disabled={pending}
            className="w-full rounded px-4 py-2.5 text-sm font-semibold text-[var(--bt-on-primary)] disabled:opacity-50 sm:w-auto sm:py-2"
            style={{ background: "var(--bt-primary)" }}
          >
            {pending ? "Saving…" : "Add log"}
          </button>
        </div>
      </form>
    </div>
  );
}
