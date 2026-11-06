"use client";

import { useMemo, useState } from "react";

import { PhotoLightbox, type LightboxPhoto } from "@/components/files/PhotoLightbox";
import { AlertIcon, DocumentIcon, VideoIcon } from "@/components/shell/icons";
import { isImageFile } from "@/lib/files/is-image-file";

export interface LogPhotoFile {
  readonly id: string;
  readonly fileName: string;
  readonly category: string;
  readonly url: string | null;
  readonly mimeType?: string | null;
}

/** Detail-page media grid with shared PhotoLightbox for photos (BT open-log chrome). */
export function LogPhotoGrid({ files }: { files: readonly LogPhotoFile[] }) {
  const lightboxPhotos: LightboxPhoto[] = useMemo(
    () =>
      files
        .filter(
          (file): file is LogPhotoFile & { url: string } =>
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
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {files.map((file) => {
          if (!file.url) {
            return (
              <div
                key={file.id}
                className="flex aspect-[4/3] flex-col items-center justify-center gap-1 rounded text-xs text-[var(--bt-muted)]"
                style={{ background: "var(--bt-panel-bg-muted)" }}
                title={`${file.fileName} is unavailable`}
              >
                <AlertIcon className="h-8 w-8" />
                <span className="max-w-full truncate px-2">{file.fileName}</span>
              </div>
            );
          }

          const isPhoto = isImageFile({
            fileName: file.fileName,
            mimeType: file.mimeType,
            category: file.category,
          });

          if (isPhoto) {
            const index = lightboxPhotos.findIndex((photo) => photo.id === file.id);
            return (
              <button
                key={file.id}
                type="button"
                onClick={() => setLightboxIndex(index >= 0 ? index : 0)}
                aria-label={`Open ${file.fileName}`}
                className="block aspect-[4/3] overflow-hidden rounded bg-[var(--bt-page-bg)]"
                title={file.fileName}
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
              className="block aspect-[4/3] overflow-hidden rounded bg-[var(--bt-page-bg)]"
              title={file.fileName}
            >
              <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-[var(--bt-muted)]">
                {file.category === "VIDEO" ? <VideoIcon className="h-8 w-8" /> : <DocumentIcon className="h-8 w-8" />}
                <span className="max-w-full truncate px-2 text-xs">{file.fileName}</span>
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
