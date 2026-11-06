"use client";

import { useRef } from "react";

import { PhotoIcon, UploadIcon, VideoIcon } from "@/components/shell/icons";

export type DailyLogPendingMedia = {
  readonly id: string;
  readonly file: File;
  readonly url: string;
  readonly kind: "image" | "video" | "other";
};

function mediaKind(file: File): DailyLogPendingMedia["kind"] {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  return "other";
}

/** Accept photos + videos from library or camera (Buildertrend-style create media). */
const MEDIA_ACCEPT = "image/*,video/*";

export function filesToPendingMedia(fileList: FileList | null): DailyLogPendingMedia[] {
  if (!fileList?.length) return [];
  const next: DailyLogPendingMedia[] = [];
  for (const file of Array.from(fileList)) {
    if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) continue;
    const kind = mediaKind(file);
    next.push({
      id: `${file.name}-${file.lastModified}-${Math.random()}`,
      file,
      url: kind === "other" ? "" : URL.createObjectURL(file),
      kind,
    });
  }
  return next;
}

/**
 * Separate Upload vs Take-now controls for daily-log create — not a single buried
 * file input. Matches the inspection-pictures camera/library split, plus video.
 */
export function DailyLogMediaPicker({
  pending,
  onAdd,
  onRemove,
  disabled,
}: {
  pending: readonly DailyLogPendingMedia[];
  onAdd: (files: FileList | null) => void;
  onRemove: (id: string) => void;
  disabled?: boolean;
}) {
  const libraryRef = useRef<HTMLInputElement>(null);
  const captureRef = useRef<HTMLInputElement>(null);

  return (
    <div className="grid gap-2">
      <span className="text-xs font-medium text-[var(--bt-muted)]">Photos &amp; videos</span>
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <button
          type="button"
          disabled={disabled}
          onClick={() => libraryRef.current?.click()}
          className="inline-flex w-full items-center justify-center gap-2 rounded border px-3 py-2.5 text-sm font-semibold text-[var(--bt-text)] disabled:opacity-50 sm:w-auto"
          style={{ borderColor: "var(--bt-border)" }}
        >
          <UploadIcon className="h-4 w-4 shrink-0 text-[var(--bt-primary)]" />
          Upload photos
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => captureRef.current?.click()}
          className="inline-flex w-full items-center justify-center gap-2 rounded px-3 py-2.5 text-sm font-semibold text-[var(--bt-on-primary)] disabled:opacity-50 sm:w-auto"
          style={{ background: "var(--bt-primary)" }}
        >
          <PhotoIcon className="h-4 w-4 shrink-0" />
          Take photos/videos now
        </button>
        <input
          ref={libraryRef}
          type="file"
          accept={MEDIA_ACCEPT}
          multiple
          className="hidden"
          onChange={(event) => {
            onAdd(event.target.files);
            event.target.value = "";
          }}
        />
        {/*
          capture="environment" routes to the rear camera on phones. Desktop browsers
          typically ignore capture and fall back to a file chooser — still usable.
        */}
        <input
          ref={captureRef}
          type="file"
          accept={MEDIA_ACCEPT}
          capture="environment"
          multiple
          className="hidden"
          onChange={(event) => {
            onAdd(event.target.files);
            event.target.value = "";
          }}
        />
      </div>
      <p className="text-[11px] leading-snug text-[var(--bt-muted)]">
        Upload picks from your library. Take photos/videos now opens the camera on phones.
      </p>

      {pending.length > 0 ? (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {pending.map((item) => (
            <li
              key={item.id}
              className="relative aspect-square overflow-hidden rounded border bg-black/5"
              style={{ borderColor: "var(--bt-border)" }}
            >
              {item.kind === "image" && item.url ? (
                // eslint-disable-next-line @next/next/no-img-element -- local object URL preview
                <img src={item.url} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center gap-1 p-2 text-center">
                  <VideoIcon className="h-6 w-6 text-[var(--bt-muted)]" />
                  <span className="line-clamp-2 text-[10px] text-[var(--bt-muted)]">{item.file.name}</span>
                </div>
              )}
              <button
                type="button"
                disabled={disabled}
                onClick={() => onRemove(item.id)}
                aria-label={`Remove ${item.file.name}`}
                className="absolute right-1 top-1 rounded bg-black/65 px-1.5 py-0.5 text-[10px] font-semibold text-white disabled:opacity-50"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
