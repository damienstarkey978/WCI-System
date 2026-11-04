"use client";

import { useMemo, useState, type ReactNode } from "react";

import { TrashIcon } from "@/components/shell/icons";
import { isImageFile } from "@/lib/files/is-image-file";

import { PhotoLightbox, type LightboxPhoto } from "./PhotoLightbox";

export interface GalleryPhoto {
  readonly id: string;
  readonly fileName: string;
  readonly url: string;
  readonly mimeType?: string | null;
  readonly category?: string | null;
}

/**
 * Shared photo grid + lightbox used by Inspection Pictures (and anywhere else
 * that shows a folder-style image grid). PDFs / non-images are omitted from
 * the lightbox set; optional manage chrome covers trash + bulk select.
 */
export function PhotoGallery({
  photos,
  emptyLabel = "No photos in this folder yet.",
  tileOverlay,
  selecting = false,
  selectedIds,
  onToggleSelected,
  onOpenChange,
}: {
  readonly photos: readonly GalleryPhoto[];
  readonly emptyLabel?: string;
  /** Per-tile chrome (e.g. trash). Receives the photo; stopPropagation on clicks. */
  readonly tileOverlay?: (photo: GalleryPhoto) => ReactNode;
  readonly selecting?: boolean;
  readonly selectedIds?: ReadonlySet<string>;
  readonly onToggleSelected?: (photoId: string) => void;
  readonly onOpenChange?: (open: boolean) => void;
}) {
  const imagePhotos = useMemo(
    () =>
      photos.filter((photo) =>
        isImageFile({
          fileName: photo.fileName,
          mimeType: photo.mimeType,
          category: photo.category ?? "PHOTO",
        }),
      ),
    [photos],
  );

  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  function openAt(index: number) {
    if (selecting) {
      const photo = imagePhotos[index];
      if (photo) onToggleSelected?.(photo.id);
      return;
    }
    setLightboxIndex(index);
    onOpenChange?.(true);
  }

  function closeLightbox() {
    setLightboxIndex(null);
    onOpenChange?.(false);
  }

  if (imagePhotos.length === 0) {
    return <p className="text-sm text-[var(--bt-muted)]">{emptyLabel}</p>;
  }

  const lightboxPhotos: LightboxPhoto[] = imagePhotos.map((p) => ({
    id: p.id,
    fileName: p.fileName,
    url: p.url,
  }));

  return (
    <>
      <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
        {imagePhotos.map((photo, index) => {
          const selected = selectedIds?.has(photo.id) ?? false;
          return (
            <li
              key={photo.id}
              className="relative aspect-square overflow-hidden rounded border"
              style={{ borderColor: selected ? "var(--bt-primary)" : "var(--bt-border)" }}
            >
              <button
                type="button"
                className="h-full w-full"
                onClick={() => openAt(index)}
                aria-label={selecting ? `Select ${photo.fileName}` : `Open ${photo.fileName}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- signed URLs are short-lived */}
                <img src={photo.url} alt={photo.fileName} className="h-full w-full object-cover" />
              </button>

              {selecting ? (
                <label
                  className="absolute left-1 top-1 flex h-6 w-6 cursor-pointer items-center justify-center rounded bg-black/70"
                  onClick={(event) => event.stopPropagation()}
                >
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={() => onToggleSelected?.(photo.id)}
                    aria-label={`Select ${photo.fileName}`}
                    className="h-3.5 w-3.5 accent-[var(--bt-primary)]"
                  />
                </label>
              ) : (
                tileOverlay?.(photo)
              )}
            </li>
          );
        })}
      </ul>

      {lightboxIndex != null ? (
        <PhotoLightbox
          photos={lightboxPhotos}
          index={lightboxIndex}
          onIndexChange={setLightboxIndex}
          onClose={closeLightbox}
        />
      ) : null}
    </>
  );
}

/** Trash control that sits on a gallery tile without opening the lightbox. */
export function PhotoTrashButton({
  label = "Delete photo",
  disabled,
  onClick,
}: {
  readonly label?: string;
  readonly disabled?: boolean;
  readonly onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-label={label}
      title={label}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onClick();
      }}
      className="absolute right-1 top-1 rounded bg-black/70 p-1.5 text-white hover:bg-black/85 disabled:opacity-50"
    >
      <TrashIcon className="h-3.5 w-3.5" />
    </button>
  );
}
