"use client";

import { useState, type ReactNode } from "react";

import { CloseIcon } from "./icons";

/**
 * Buildertrend's page header pattern: one primary blue button opens a modal with
 * the real create form inside, instead of the form sitting inline on the page.
 * `children` is whatever create-form component the page already has — this is
 * purely a trigger + overlay, it has no opinion on what's inside.
 *
 * Does not auto-close on a successful submit yet — the existing create-form
 * components don't call back out when they're done (they're plain Server Action
 * forms with their own useActionState). A page that wants auto-close passes its
 * own `open`/`onOpenChange` instead of relying on the uncontrolled default, once
 * that form is updated to report success. Until then, closing is just the X
 * button, the backdrop, or the after-submit state showing success inline.
 */
export function CreateModal({
  triggerLabel,
  title,
  children,
  open: controlledOpen,
  onOpenChange,
  variant = "primary",
  size = "md",
  hideHeader = false,
}: {
  triggerLabel: string;
  title: string;
  children: ReactNode;
  /** Pass both to control the modal from the parent (e.g. close it after a redirect). Omit for the default uncontrolled behavior. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** "secondary" is the outlined button for a page's non-primary actions (Import, Use template). */
  variant?: "primary" | "secondary";
  /** "lg" matches Buildertrend's Schedule Item / similar wide forms. */
  size?: "md" | "lg";
  /** When the child form renders its own title bar (e.g. Schedule Item). */
  hideHeader?: boolean;
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = onOpenChange ?? setUncontrolledOpen;
  const maxWidth = size === "lg" ? "max-w-3xl" : "max-w-lg";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          variant === "primary"
            ? "rounded px-4 py-2 text-sm font-semibold text-[var(--bt-on-primary)]"
            : "rounded border px-3 py-2 text-sm font-semibold text-[var(--bt-text)] hover:bg-black/5"
        }
        style={variant === "primary" ? { background: "var(--bt-primary)" } : { borderColor: "var(--bt-border)" }}
      >
        {triggerLabel}
      </button>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div
            className={`relative flex max-h-[90vh] w-full ${maxWidth} flex-col overflow-hidden rounded-lg bg-[var(--bt-panel-bg)] shadow-xl`}
            role="dialog"
            aria-modal="true"
            aria-label={title}
          >
            {hideHeader ? null : (
              <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: "var(--bt-border)" }}>
                <h2 className="text-sm font-semibold text-[var(--bt-text)]">{title}</h2>
                <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="rounded p-1 text-[var(--bt-muted)] hover:bg-black/5">
                  <CloseIcon className="h-4 w-4" />
                </button>
              </div>
            )}
            <div className={hideHeader ? "overflow-y-auto" : "overflow-y-auto p-4"}>{children}</div>
          </div>
        </div>
      ) : null}
    </>
  );
}
