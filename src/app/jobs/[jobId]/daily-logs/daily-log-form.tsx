"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState, useTransition, type FormEvent } from "react";

import { compressImageFiles } from "@/lib/client/compress-image";

import { draftDailyLogNoteAction, type DraftDailyLogActionState } from "./actions";
import {
  DailyLogMediaPicker,
  filesToPendingMedia,
  type DailyLogPendingMedia,
} from "./daily-log-media-picker";

const DRAFT_INITIAL: DraftDailyLogActionState = {};

const RELOAD_GUIDANCE =
  "This tab is out of date with the server (often after a deploy). Reload the page, then create the log and attach photos again — Try again will not fix it.";

function looksLikeDeploySkew(status: number, bodyText: string): boolean {
  if (status === 404 || status === 409 || status === 410) return true;
  if (status >= 500 && /failed to find server action|unexpected response|html/i.test(bodyText)) return true;
  // HTML error pages instead of JSON usually mean a cutover / incomplete reply.
  const trimmed = bodyText.trimStart();
  return trimmed.startsWith("<!DOCTYPE") || trimmed.startsWith("<html");
}

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
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const [pendingMedia, setPendingMedia] = useState<DailyLogPendingMedia[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [needsReload, setNeedsReload] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function addMedia(fileList: FileList | null) {
    const added = filesToPendingMedia(fileList);
    if (added.length === 0) return;
    setPendingMedia((prev) => [...prev, ...added]);
    setError(null);
    setNeedsReload(false);
  }

  function removeMedia(id: string) {
    setPendingMedia((prev) => {
      const target = prev.find((item) => item.id === id);
      if (target?.url) URL.revokeObjectURL(target.url);
      return prev.filter((item) => item.id !== id);
    });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const note = String(formData.get("note") ?? "").trim();
    const title = String(formData.get("title") ?? "").trim();
    const clientVisible = formData.get("clientVisible") === "on";
    const subVisible = formData.get("subVisible") === "on";
    if (!note) {
      setError("Note is required.");
      return;
    }

    startTransition(async () => {
      setError(null);
      setNeedsReload(false);
      setProgress(pendingMedia.length > 0 ? "Saving log…" : null);

      try {
        // 1) Create the log via a stable staff route (no Server Action hash).
        const createRes = await fetch("/api/staff/daily-logs", {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ jobId, title, note, clientVisible, subVisible }),
        });
        const createText = await createRes.text();
        if (!createRes.ok) {
          if (looksLikeDeploySkew(createRes.status, createText)) {
            setNeedsReload(true);
            setError(RELOAD_GUIDANCE);
            return;
          }
          let message = "Could not save the daily log.";
          try {
            const parsed = JSON.parse(createText) as { error?: { message?: string } };
            if (parsed.error?.message) message = parsed.error.message;
          } catch {
            /* keep default */
          }
          setError(message);
          return;
        }

        let logId: string | undefined;
        try {
          const parsed = JSON.parse(createText) as { data?: { id?: string } };
          logId = parsed.data?.id;
        } catch {
          setNeedsReload(true);
          setError(RELOAD_GUIDANCE);
          return;
        }
        if (!logId) {
          setError("Could not save the daily log.");
          return;
        }

        // 2) Attach media separately so a cutover mid-upload doesn't redo the note.
        if (pendingMedia.length > 0) {
          setProgress(`Preparing ${pendingMedia.length} file${pendingMedia.length === 1 ? "" : "s"}…`);
          const images = pendingMedia.filter((item) => item.kind === "image").map((item) => item.file);
          const nonImages = pendingMedia.filter((item) => item.kind !== "image").map((item) => item.file);
          const compressedImages = await compressImageFiles(images);
          const filesToUpload = [...compressedImages, ...nonImages];

          const batchSize = 3;
          let done = 0;
          try {
            for (let i = 0; i < filesToUpload.length; i += batchSize) {
              const slice = filesToUpload.slice(i, i + batchSize);
              setProgress(`Uploading ${done + 1}–${Math.min(done + slice.length, filesToUpload.length)} of ${filesToUpload.length}…`);
              await Promise.all(
                slice.map(async (file) => {
                  const body = new FormData();
                  body.append("files", file);
                  const uploadRes = await fetch(`/api/staff/daily-logs/${logId}/files`, {
                    method: "POST",
                    body,
                    headers: { Accept: "application/json" },
                  });
                  const uploadText = await uploadRes.text();
                  if (!uploadRes.ok) {
                    if (looksLikeDeploySkew(uploadRes.status, uploadText)) {
                      throw Object.assign(new Error(RELOAD_GUIDANCE), { needsReload: true });
                    }
                    let message = `Could not upload ${file.name}.`;
                    try {
                      const parsed = JSON.parse(uploadText) as { error?: { message?: string } };
                      if (parsed.error?.message) message = parsed.error.message;
                    } catch {
                      /* keep default */
                    }
                    throw new Error(message);
                  }
                }),
              );
              done += slice.length;
            }
          } catch (uploadErr) {
            const detail = uploadErr instanceof Error ? uploadErr.message : "Upload failed.";
            const reload =
              Boolean(uploadErr && typeof uploadErr === "object" && "needsReload" in uploadErr) ||
              /out of date with the server|reload the page/i.test(detail);
            throw Object.assign(
              new Error(
                `Log saved, but ${filesToUpload.length - done} file${filesToUpload.length - done === 1 ? "" : "s"} did not attach (${detail}). Reload, open the new log from the list, or create again with media.`,
              ),
              { needsReload: reload },
            );
          }
        }

        for (const item of pendingMedia) {
          if (item.url) URL.revokeObjectURL(item.url);
        }
        setPendingMedia([]);
        setProgress(null);
        form.reset();
        onSuccess?.();
        router.refresh();
      } catch (err) {
        const message = err instanceof Error ? err.message : "Could not save the daily log.";
        const reload = Boolean(err && typeof err === "object" && "needsReload" in err && (err as { needsReload?: boolean }).needsReload);
        setNeedsReload(reload || /out of date with the server|reload the page/i.test(message));
        setError(message);
        setProgress(null);
      }
    });
  }

  return (
    <div>
      {aiEnabled ? <DraftWithAi noteRef={noteRef} /> : null}

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <label className="grid gap-1 text-sm">
          <span className="text-xs font-medium text-[var(--bt-muted)]">Title</span>
          <input
            name="title"
            maxLength={200}
            placeholder="Prime walk thru"
            disabled={isPending}
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
            disabled={isPending}
            placeholder="What happened on site today?"
            className="w-full rounded border px-3 py-2.5 text-base outline-none focus:border-[var(--bt-primary)] sm:py-2 sm:text-sm"
            style={{ borderColor: "var(--bt-border)" }}
          />
        </label>

        <DailyLogMediaPicker pending={pendingMedia} onAdd={addMedia} onRemove={removeMedia} disabled={isPending} />

        <div className="flex flex-col gap-2 text-xs text-[var(--bt-muted)] sm:flex-row sm:flex-wrap sm:items-center sm:gap-4">
          <label className="flex items-center gap-1.5">
            <input type="checkbox" name="clientVisible" defaultChecked disabled={isPending} />
            Visible to client
          </label>
          <label className="flex items-center gap-1.5">
            <input type="checkbox" name="subVisible" defaultChecked disabled={isPending} />
            Visible to subs
          </label>
        </div>

        {progress ? <p className="text-xs text-[var(--bt-muted)]">{progress}</p> : null}

        {error ? (
          <div
            role="alert"
            className={`rounded border p-3 text-xs ${needsReload ? "border-amber-300 bg-amber-50 text-amber-950" : "border-red-200 bg-red-50 text-red-700"}`}
          >
            <p>{error}</p>
            {needsReload ? (
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="mt-2 rounded px-3 py-1.5 text-xs font-semibold text-white"
                style={{ background: "var(--bt-primary, #1a56db)" }}
              >
                Reload page
              </button>
            ) : null}
          </div>
        ) : null}

        <div>
          <button
            type="submit"
            disabled={isPending}
            className="w-full rounded px-4 py-2.5 text-sm font-semibold text-[var(--bt-on-primary)] disabled:opacity-50 sm:w-auto sm:py-2"
            style={{ background: "var(--bt-primary)" }}
          >
            {isPending ? "Saving…" : "Add log"}
          </button>
        </div>
      </form>
    </div>
  );
}
