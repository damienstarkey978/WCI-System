"use client";

import { useRef, useState, useTransition } from "react";

import { compressImageFiles } from "@/lib/client/compress-image";

import { uploadInspectorPhotosAction } from "./actions";

type LocalThumb = { id: string; file: File; url: string };

export function InspectorPhotoCapture({
  token,
  existing,
}: {
  token: string;
  existing: readonly { id: string; fileName: string; url: string }[];
}) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<LocalThumb[]>([]);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [uploaded, setUploaded] = useState(existing);
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
        const batchSize = 3;
        let done = 0;
        for (let i = 0; i < compressed.length; i += batchSize) {
          const slice = compressed.slice(i, i + batchSize);
          await Promise.all(
            slice.map(async (file) => {
              const formData = new FormData();
              formData.set("token", token);
              formData.append("files", file);
              const result = await uploadInspectorPhotosAction({}, formData);
              if (result.error) throw new Error(result.error);
            }),
          );
          done += slice.length;
          setProgress({ done, total: compressed.length });
        }
        const justUploaded = pending.map((thumb) => ({
          id: thumb.id,
          fileName: thumb.file.name,
          url: thumb.url,
        }));
        setUploaded((prev) => [...justUploaded, ...prev]);
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
      <div className="sticky top-0 z-10 -mx-4 flex flex-col gap-2 border-b bg-[var(--bt-bg,white)] px-4 py-3 sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0">
        <button
          type="button"
          onClick={() => cameraRef.current?.click()}
          className="min-h-12 w-full rounded-xl px-4 py-3.5 text-base font-semibold text-[var(--bt-on-primary)]"
          style={{ background: "var(--bt-primary)" }}
        >
          Take photos
        </button>
        <button
          type="button"
          onClick={() => libraryRef.current?.click()}
          className="min-h-11 w-full rounded-xl border px-4 py-3 text-sm font-semibold text-[var(--bt-text)]"
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
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium text-[var(--bt-text)]">{pending.length} ready</p>
            <button
              type="button"
              disabled={isPending}
              onClick={upload}
              className="rounded-lg px-4 py-2.5 text-sm font-semibold text-[var(--bt-on-primary)] disabled:opacity-50"
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
          <ul className="grid grid-cols-3 gap-2">
            {pending.map((thumb) => (
              <li key={thumb.id} className="relative aspect-square overflow-hidden rounded-lg border" style={{ borderColor: "var(--bt-border)" }}>
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

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {message ? <p className="text-sm text-emerald-700">{message}</p> : null}

      <div>
        <h2 className="mb-2 text-sm font-semibold text-[var(--bt-text)]">Photos ({uploaded.length})</h2>
        {uploaded.length === 0 ? (
          <p className="text-sm text-[var(--bt-muted)]">No photos yet — take or upload evidence for this inspection.</p>
        ) : (
          <ul className="grid grid-cols-3 gap-2">
            {uploaded.map((file) => (
              <li key={file.id} className="aspect-square overflow-hidden rounded-lg border" style={{ borderColor: "var(--bt-border)" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={file.url} alt={file.fileName} className="h-full w-full object-cover" />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
