"use client";

import { useRef, useState, useTransition } from "react";

import { compressImageFiles } from "@/lib/client/compress-image";

import { deleteInspectionPhotoAction, uploadInspectionPhotosAction } from "./actions";

type LocalThumb = { id: string; file: File; url: string };

export function InspectionPhotoCapture({
  jobId,
  folderId,
  existing,
}: {
  jobId: string;
  folderId: string;
  existing: readonly { id: string; fileName: string; url: string }[];
}) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<LocalThumb[]>([]);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function addFiles(fileList: FileList | null) {
    if (!fileList?.length) return;
    const next: LocalThumb[] = [];
    for (const file of Array.from(fileList)) {
      if (!file.type.startsWith("image/")) continue;
      next.push({ id: `${file.name}-${file.lastModified}-${Math.random()}`, file, url: URL.createObjectURL(file) });
    }
    setPending((prev) => [...prev, ...next]);
    setError(null);
    setMessage(null);
  }

  function removePending(id: string) {
    setPending((prev) => {
      const target = prev.find((p) => p.id === id);
      if (target) URL.revokeObjectURL(target.url);
      return prev.filter((p) => p.id !== id);
    });
  }

  function upload() {
    if (pending.length === 0) return;
    startTransition(async () => {
      setError(null);
      setMessage(null);
      setProgress({ done: 0, total: pending.length });
      try {
        const compressed = await compressImageFiles(pending.map((p) => p.file));
        // Parallel upload in small batches so progress is visible.
        const batchSize = 3;
        let done = 0;
        for (let i = 0; i < compressed.length; i += batchSize) {
          const slice = compressed.slice(i, i + batchSize);
          await Promise.all(
            slice.map(async (file) => {
              const formData = new FormData();
              formData.set("jobId", jobId);
              formData.set("folderId", folderId);
              formData.append("files", file);
              const result = await uploadInspectionPhotosAction({}, formData);
              if (result.error) throw new Error(result.error);
            }),
          );
          done += slice.length;
          setProgress({ done, total: compressed.length });
        }
        for (const thumb of pending) URL.revokeObjectURL(thumb.url);
        setPending([]);
        setMessage(`Uploaded ${compressed.length} photo${compressed.length === 1 ? "" : "s"}.`);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed.");
      } finally {
        setProgress(null);
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <button
          type="button"
          onClick={() => cameraRef.current?.click()}
          className="w-full rounded px-4 py-2.5 text-sm font-semibold text-[var(--bt-on-primary)] sm:w-auto"
          style={{ background: "var(--bt-primary)" }}
        >
          Start Taking Photos
        </button>
        <button
          type="button"
          onClick={() => libraryRef.current?.click()}
          className="w-full rounded border px-4 py-2.5 text-sm font-semibold text-[var(--bt-text)] sm:w-auto"
          style={{ borderColor: "var(--bt-border)" }}
        >
          Choose from library
        </button>
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          className="hidden"
          onChange={(event) => {
            addFiles(event.target.files);
            event.target.value = "";
          }}
        />
        <input
          ref={libraryRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(event) => {
            addFiles(event.target.files);
            event.target.value = "";
          }}
        />
      </div>

      {pending.length > 0 ? (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium text-[var(--bt-text)]">{pending.length} ready to upload</p>
            <button
              type="button"
              disabled={isPending}
              onClick={upload}
              className="rounded px-4 py-2 text-sm font-semibold text-[var(--bt-on-primary)] disabled:opacity-50"
              style={{ background: "var(--bt-primary)" }}
            >
              {isPending ? "Uploading…" : "Upload"}
            </button>
          </div>
          {progress ? (
            <p className="text-xs text-[var(--bt-muted)]">
              Progress {progress.done}/{progress.total}
            </p>
          ) : null}
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
            {pending.map((thumb) => (
              <li key={thumb.id} className="relative aspect-square overflow-hidden rounded border" style={{ borderColor: "var(--bt-border)" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={thumb.url} alt="" className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={() => removePending(thumb.id)}
                  aria-label="Remove photo"
                  className="absolute right-1 top-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold text-white"
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {error ? <p className="text-xs text-red-600">{error}</p> : null}
      {message ? <p className="text-xs text-emerald-700">{message}</p> : null}

      <div>
        <h3 className="mb-2 text-sm font-semibold text-[var(--bt-text)]">Uploaded ({existing.length})</h3>
        {existing.length === 0 ? (
          <p className="text-sm text-[var(--bt-muted)]">No photos in this folder yet.</p>
        ) : (
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
            {existing.map((file) => (
              <li key={file.id} className="relative aspect-square overflow-hidden rounded border" style={{ borderColor: "var(--bt-border)" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={file.url} alt={file.fileName} className="h-full w-full object-cover" />
                <form action={deleteInspectionPhotoAction} className="absolute right-1 top-1">
                  <input type="hidden" name="jobId" value={jobId} />
                  <input type="hidden" name="folderId" value={folderId} />
                  <input type="hidden" name="fileId" value={file.id} />
                  <button type="submit" className="rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                    Delete
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
