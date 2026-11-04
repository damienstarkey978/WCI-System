"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import { PhotoGallery, PhotoTrashButton } from "@/components/files/PhotoGallery";
import { compressImageFiles } from "@/lib/client/compress-image";

import {
  deleteInspectionPhotoAction,
  deleteInspectionPhotosAction,
  uploadInspectionPhotosAction,
} from "./actions";

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
  const router = useRouter();
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<LocalThumb[]>([]);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [selecting, setSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  /** Optimistic removals so trash feels instant before refresh lands. */
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(() => new Set());

  const visibleExisting = existing.filter((file) => !hiddenIds.has(file.id));

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
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed.");
      } finally {
        setProgress(null);
      }
    });
  }

  function exitSelectMode() {
    setSelecting(false);
    setSelectedIds(new Set());
  }

  function toggleSelected(photoId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(photoId)) next.delete(photoId);
      else next.add(photoId);
      return next;
    });
  }

  function deleteOne(fileId: string) {
    if (!window.confirm("Delete this photo? It moves to Files → View trash.")) return;
    setHiddenIds((prev) => new Set(prev).add(fileId));
    startTransition(async () => {
      setError(null);
      const formData = new FormData();
      formData.set("jobId", jobId);
      formData.set("folderId", folderId);
      formData.set("fileId", fileId);
      const result = await deleteInspectionPhotoAction({}, formData);
      if (result.error) {
        setHiddenIds((prev) => {
          const next = new Set(prev);
          next.delete(fileId);
          return next;
        });
        setError(result.error);
        return;
      }
      setMessage("Photo deleted.");
      router.refresh();
    });
  }

  function deleteSelected() {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    if (!window.confirm(`Delete ${ids.length} selected photo${ids.length === 1 ? "" : "s"}? They move to Files → View trash.`)) {
      return;
    }
    setHiddenIds((prev) => {
      const next = new Set(prev);
      for (const id of ids) next.add(id);
      return next;
    });
    startTransition(async () => {
      setError(null);
      const formData = new FormData();
      formData.set("jobId", jobId);
      formData.set("folderId", folderId);
      for (const id of ids) formData.append("fileIds", id);
      const result = await deleteInspectionPhotosAction({}, formData);
      if (result.error) {
        setHiddenIds((prev) => {
          const next = new Set(prev);
          for (const id of ids) next.delete(id);
          return next;
        });
        setError(result.error);
        return;
      }
      exitSelectMode();
      setMessage(`Deleted ${ids.length} photo${ids.length === 1 ? "" : "s"}.`);
      router.refresh();
    });
  }

  function downloadSelected() {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    startTransition(async () => {
      setError(null);
      try {
        const response = await fetch(`/jobs/${jobId}/files/download-zip`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fileIds: ids }),
        });
        if (!response.ok) {
          const text = await response.text();
          throw new Error(text || `Download failed (${response.status}).`);
        }
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        const disposition = response.headers.get("Content-Disposition") ?? "";
        const match = /filename="([^"]+)"/.exec(disposition);
        anchor.href = url;
        anchor.download = match?.[1] ?? "inspection-photos.zip";
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(url);
        setMessage(`Downloaded ${ids.length} photo${ids.length === 1 ? "" : "s"}.`);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Download failed.");
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
                <PhotoTrashButton label="Remove photo" onClick={() => removePending(thumb.id)} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {error ? <p className="text-xs text-red-600">{error}</p> : null}
      {message ? <p className="text-xs text-emerald-700">{message}</p> : null}

      <div>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-[var(--bt-text)]">Uploaded ({visibleExisting.length})</h3>
          {visibleExisting.length > 0 ? (
            selecting ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-[var(--bt-muted)]">{selectedIds.size} selected</span>
                <button
                  type="button"
                  disabled={isPending || selectedIds.size === 0}
                  onClick={downloadSelected}
                  className="rounded border px-3 py-1.5 text-xs font-semibold text-[var(--bt-text)] disabled:opacity-50"
                  style={{ borderColor: "var(--bt-border)" }}
                >
                  Download
                </button>
                <button
                  type="button"
                  disabled={isPending || selectedIds.size === 0}
                  onClick={deleteSelected}
                  className="rounded border px-3 py-1.5 text-xs font-semibold text-red-700 disabled:opacity-50"
                  style={{ borderColor: "var(--bt-border)" }}
                >
                  Delete
                </button>
                <button
                  type="button"
                  disabled={isPending}
                  onClick={exitSelectMode}
                  className="rounded border px-3 py-1.5 text-xs font-semibold text-[var(--bt-text)]"
                  style={{ borderColor: "var(--bt-border)" }}
                >
                  Done
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setSelecting(true);
                  setSelectedIds(new Set());
                  setMessage(null);
                }}
                className="rounded border px-3 py-1.5 text-xs font-semibold text-[var(--bt-text)]"
                style={{ borderColor: "var(--bt-border)" }}
              >
                Select
              </button>
            )
          ) : null}
        </div>

        <PhotoGallery
          photos={visibleExisting.map((file) => ({
            id: file.id,
            fileName: file.fileName,
            url: file.url,
            category: "PHOTO",
          }))}
          selecting={selecting}
          selectedIds={selectedIds}
          onToggleSelected={toggleSelected}
          tileOverlay={(photo) => (
            <PhotoTrashButton disabled={isPending} onClick={() => deleteOne(photo.id)} />
          )}
        />
      </div>
    </div>
  );
}
