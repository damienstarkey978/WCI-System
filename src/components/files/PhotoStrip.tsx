"use client";

import { useMemo, useState } from "react";

import { AlertIcon, DocumentIcon, VideoIcon } from "@/components/shell/icons";
import { isImageFile } from "@/lib/files/is-image-file";

import { PhotoLightbox, type LightboxPhoto } from "./PhotoLightbox";

export interface PhotoStripFile {
  readonly id: string;
  /** Null when the file's storage object couldn't be signed — see resolveFileUrlSafe. */
  readonly url: string | null;
  readonly category: string;
  readonly fileName: string;
  readonly mimeType?: string | null;
}

/** Thumbnail strip for files attached to a single record (a daily log, etc). */
export function PhotoStrip({ files }: { files: readonly PhotoStripFile[] }) {
  const lightboxPhotos: LightboxPhoto[] = useMemo(
    () =>
      files
        .filter(
          (file): file is PhotoStripFile & { url: string } =>
            file.url != null &&
            isImageFile({
              fileName: file.fileName,
              mimeType: file.mimeType,
              category: file.category,
            }),
        )
        .map((file) => ({ id: file.id, fileName: file.fileName, url: file.url })),
    [files],
  );

  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  if (files.length === 0) return null;

  return (
    <>
      <div className="mt-2 flex flex-wrap gap-2">
        {files.map((file) => {
          if (file.url === null) {
            return (
              <div
                key={file.id}
                title={`${file.fileName} — not found in storage`}
                className="flex h-16 w-16 items-center justify-center rounded border text-[var(--bt-muted)]"
                style={{
                  borderColor: "var(--bt-border)",
                  background: "color-mix(in srgb, var(--bt-hazard) 8%, var(--bt-page-bg))",
                }}
              >
                <AlertIcon className="h-6 w-6" />
              </div>
            );
          }

          const isPhoto = isImageFile({
            fileName: file.fileName,
            mimeType: file.mimeType,
            category: file.category,
          });

          if (isPhoto) {
            const index = lightboxPhotos.findIndex((p) => p.id === file.id);
            return (
              <button
                key={file.id}
                type="button"
                onClick={() => setLightboxIndex(index >= 0 ? index : 0)}
                aria-label={`Open ${file.fileName}`}
                className="block h-16 w-16 overflow-hidden rounded border"
                style={{ borderColor: "var(--bt-border)" }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- signed URLs are short-lived and per-request, not suited to next/image's caching */}
                <img src={file.url} alt={file.fileName} className="h-full w-full object-cover" />
              </button>
            );
          }

          return (
            <a
              key={file.id}
              href={file.url}
              target="_blank"
              rel="noreferrer"
              className="block h-16 w-16 overflow-hidden rounded border"
              style={{ borderColor: "var(--bt-border)" }}
            >
              <div className="flex h-full w-full items-center justify-center bg-[var(--bt-page-bg)] text-[var(--bt-muted)]">
                {file.category === "VIDEO" ? <VideoIcon className="h-6 w-6" /> : <DocumentIcon className="h-6 w-6" />}
              </div>
            </a>
          );
        })}
      </div>

      {lightboxIndex != null ? (
        <PhotoLightbox
          photos={lightboxPhotos}
          index={lightboxIndex}
          onIndexChange={setLightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      ) : null}
    </>
  );
}
