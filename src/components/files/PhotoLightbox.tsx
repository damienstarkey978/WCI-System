"use client";

import { useEffect, useRef } from "react";

import { ChevronLeftIcon, ChevronRightIcon, CloseIcon } from "@/components/shell/icons";
import { nextPhotoIndex, prevPhotoIndex } from "@/lib/files/photo-nav";

export interface LightboxPhoto {
  readonly id: string;
  readonly fileName: string;
  readonly url: string;
}

/**
 * Full-viewport photo lightbox: Esc / backdrop / close dismiss; ←/→ and on-screen
 * arrows walk the folder. Shared by Inspection Pictures + PhotoStrip.
 */
export function PhotoLightbox({
  photos,
  index,
  onIndexChange,
  onClose,
}: {
  readonly photos: readonly LightboxPhoto[];
  readonly index: number;
  readonly onIndexChange: (index: number) => void;
  readonly onClose: () => void;
}) {
  const touchStartX = useRef<number | null>(null);
  const photo = photos[index] ?? null;
  const hasMany = photos.length > 1;

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        const next = nextPhotoIndex(index, photos.length);
        if (next != null) onIndexChange(next);
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        const prev = prevPhotoIndex(index, photos.length);
        if (prev != null) onIndexChange(prev);
      }
    }
    window.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [index, photos.length, onClose, onIndexChange]);

  if (!photo) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={photo.fileName}
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute right-3 top-3 z-10 rounded-full bg-black/60 p-2 text-white hover:bg-black/80 sm:right-4 sm:top-4"
      >
        <CloseIcon className="h-5 w-5" />
      </button>

      {hasMany ? (
        <button
          type="button"
          aria-label="Previous photo"
          className="absolute left-2 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/60 p-2.5 text-white hover:bg-black/80 sm:left-4"
          onClick={(event) => {
            event.stopPropagation();
            const prev = prevPhotoIndex(index, photos.length);
            if (prev != null) onIndexChange(prev);
          }}
        >
          <ChevronLeftIcon className="h-6 w-6" />
        </button>
      ) : null}

      {hasMany ? (
        <button
          type="button"
          aria-label="Next photo"
          className="absolute right-2 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/60 p-2.5 text-white hover:bg-black/80 sm:right-4"
          onClick={(event) => {
            event.stopPropagation();
            const next = nextPhotoIndex(index, photos.length);
            if (next != null) onIndexChange(next);
          }}
        >
          <ChevronRightIcon className="h-6 w-6" />
        </button>
      ) : null}

      <div
        className="relative flex max-h-full max-w-full flex-col items-center gap-2"
        onClick={(event) => event.stopPropagation()}
        onTouchStart={(event) => {
          touchStartX.current = event.changedTouches[0]?.clientX ?? null;
        }}
        onTouchEnd={(event) => {
          const start = touchStartX.current;
          touchStartX.current = null;
          if (start == null || !hasMany) return;
          const end = event.changedTouches[0]?.clientX ?? start;
          const delta = end - start;
          if (Math.abs(delta) < 48) return;
          if (delta < 0) {
            const next = nextPhotoIndex(index, photos.length);
            if (next != null) onIndexChange(next);
          } else {
            const prev = prevPhotoIndex(index, photos.length);
            if (prev != null) onIndexChange(prev);
          }
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- signed URLs are short-lived */}
        <img
          src={photo.url}
          alt={photo.fileName}
          className="max-h-[min(85dvh,900px)] max-w-[min(96vw,1200px)] object-contain"
        />
        <p className="max-w-[min(96vw,1200px)] truncate px-2 text-center text-xs text-white/80">
          {photo.fileName}
          {hasMany ? ` · ${index + 1} / ${photos.length}` : ""}
        </p>
      </div>
    </div>
  );
}
