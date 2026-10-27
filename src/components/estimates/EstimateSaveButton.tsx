/**
 * Handoff-style "Save changes" chrome. Estimate line edits persist via
 * server actions as they happen; this control confirms the draft is saved
 * (and offers a soft refresh) so the header matches Handoff's Save + Convert pair.
 */

"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export function EstimateSaveButton({ editable }: { readonly editable: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [flash, setFlash] = useState(false);

  if (!editable) {
    return (
      <span
        className="inline-flex min-h-9 items-center rounded-md border px-3 py-1.5 text-xs font-semibold text-[var(--bt-muted)] sm:min-h-0"
        style={{ borderColor: "var(--bt-border)", background: "var(--bt-panel-bg)" }}
      >
        Locked
      </span>
    );
  }

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        startTransition(() => {
          router.refresh();
          setFlash(true);
          window.setTimeout(() => setFlash(false), 1600);
        });
      }}
      className="inline-flex min-h-9 touch-manipulation items-center justify-center rounded-md border px-3 py-1.5 text-xs font-semibold sm:min-h-0"
      style={{
        borderColor: "color-mix(in srgb, var(--bt-primary) 40%, var(--bt-border))",
        background: flash
          ? "color-mix(in srgb, var(--bt-primary) 12%, var(--bt-panel-bg))"
          : "var(--bt-panel-bg)",
        color: "var(--bt-primary)",
      }}
    >
      {pending ? "Saving…" : flash ? "Saved" : "Save changes"}
    </button>
  );
}
