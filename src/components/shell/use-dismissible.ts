"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

/**
 * Open/close state for a dropdown that closes on Escape and outside click.
 * Shared by TopNav menus so Escape behaves the same in every header dropdown.
 */
export function useDismissible(initialOpen = false): {
  readonly open: boolean;
  readonly setOpen: (value: boolean | ((prev: boolean) => boolean)) => void;
  readonly rootRef: RefObject<HTMLDivElement | null>;
} {
  const [open, setOpen] = useState(initialOpen);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return { open, setOpen, rootRef };
}
