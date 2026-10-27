/**
 * Handoff-style "Convert to" dropdown. Proposal is the real conversion path;
 * PDF/CSV export work today; other document types are listed for parity but
 * stay disabled until those modules accept an estimate source.
 */

"use client";

import Link from "next/link";
import { useActionState, useEffect, useId, useRef, useState } from "react";

import { createProposalFromEstimateAction, type ActionState } from "@/app/leads/estimates/[estimateId]/actions";

type ConvertTarget =
  | { readonly kind: "proposal"; readonly label: string; readonly enabled: boolean }
  | { readonly kind: "link"; readonly label: string; readonly href: string; readonly enabled: boolean }
  | { readonly kind: "disabled"; readonly label: string; readonly reason: string };

export function ConvertToMenu({
  estimateId,
  linkedProposalId,
  canConvertToProposal,
  pdfHref,
  csvHref,
}: {
  readonly estimateId: string;
  readonly linkedProposalId: string | null;
  readonly canConvertToProposal: boolean;
  readonly pdfHref: string | null;
  readonly csvHref: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const [state, formAction, pending] = useActionState(createProposalFromEstimateAction, {} as ActionState);

  useEffect(() => {
    if (!open) return;
    function onDocClick(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const targets: ConvertTarget[] = [
    linkedProposalId
      ? { kind: "link", label: "Open Proposal", href: `/leads/proposals/${linkedProposalId}?view=proposal`, enabled: true }
      : { kind: "proposal", label: "Proposal", enabled: canConvertToProposal },
    pdfHref
      ? { kind: "link", label: "PDF", href: pdfHref, enabled: true }
      : { kind: "disabled", label: "PDF", reason: "Convert to a Proposal first to preview/print PDF" },
    { kind: "link", label: "CSV", href: csvHref, enabled: true },
    { kind: "disabled", label: "Invoice", reason: "Available after the job is sold" },
    { kind: "disabled", label: "Change order", reason: "Available on an open job" },
    { kind: "disabled", label: "Schedule", reason: "Coming soon from estimate" },
    { kind: "disabled", label: "Task list", reason: "Coming soon" },
    { kind: "disabled", label: "Scope of work", reason: "Coming soon" },
    { kind: "disabled", label: "Material list", reason: "Coming soon" },
    { kind: "disabled", label: "Work order", reason: "Coming soon" },
  ];

  return (
    <div
      ref={rootRef}
      id="convert-to-proposal"
      className="relative inline-flex flex-col items-stretch gap-1 sm:items-end scroll-mt-24"
    >
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex min-h-9 w-full touch-manipulation items-center justify-center gap-1.5 rounded-md px-3.5 py-1.5 text-xs font-semibold text-[var(--bt-on-primary)] shadow-sm sm:min-h-0 sm:w-auto"
        style={{ background: "var(--bt-primary)" }}
      >
        Convert to
        <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden className="opacity-90">
          <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open ? (
        <div
          id={menuId}
          role="menu"
          className="absolute right-0 top-full z-30 mt-1 w-[min(100vw-2rem,16rem)] overflow-hidden rounded-lg border bg-[var(--bt-panel-bg)] py-1 shadow-lg"
          style={{ borderColor: "var(--bt-border)" }}
        >
          {targets.map((target, index) => {
            const showDivider = index === 3;
            if (target.kind === "proposal") {
              return (
                <form key="proposal" action={formAction} role="none">
                  <input type="hidden" name="estimateId" value={estimateId} />
                  <button
                    type="submit"
                    role="menuitem"
                    disabled={!target.enabled || pending}
                    className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm font-medium text-[var(--bt-text)] hover:bg-[var(--bt-panel-bg-muted)] disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    <span className="inline-flex items-center gap-2">
                      <ConvertMenuIcon kind="proposal" />
                      {pending ? "Converting…" : target.label}
                    </span>
                    <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--bt-primary)" }}>
                      Primary
                    </span>
                  </button>
                </form>
              );
            }
            if (target.kind === "link") {
              return (
                <div key={target.label}>
                  {showDivider ? (
                    <div className="my-1 border-t" style={{ borderColor: "var(--bt-border)" }} role="separator" />
                  ) : null}
                  <Link
                    href={target.href}
                    role="menuitem"
                    target={target.label === "PDF" || target.label === "CSV" ? "_blank" : undefined}
                    className="flex items-center gap-2 px-3 py-2 text-sm text-[var(--bt-text)] hover:bg-[var(--bt-panel-bg-muted)]"
                    onClick={() => setOpen(false)}
                  >
                    <ConvertMenuIcon kind={target.label === "PDF" || target.label === "CSV" ? "export" : "doc"} />
                    {target.label}
                  </Link>
                </div>
              );
            }
            return (
              <div key={target.label}>
                {showDivider ? (
                  <div className="my-1 border-t" style={{ borderColor: "var(--bt-border)" }} role="separator" />
                ) : null}
                <div
                  role="menuitem"
                  aria-disabled="true"
                  title={target.reason}
                  className="flex cursor-not-allowed items-center justify-between gap-2 px-3 py-2 text-sm text-[var(--bt-muted)] opacity-60"
                >
                  <span className="inline-flex items-center gap-2">
                    <ConvertMenuIcon kind="soon" />
                    {target.label}
                  </span>
                  <span className="text-[10px]">Soon</span>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
      {state.error ? <p className="max-w-xs text-xs text-red-600">{state.error}</p> : null}
    </div>
  );
}

function ConvertMenuIcon({ kind }: { readonly kind: "proposal" | "export" | "doc" | "soon" }) {
  const stroke = "currentColor";
  if (kind === "proposal") {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden className="opacity-70">
        <path d="M7 3h7l5 5v13H7V3Z" stroke={stroke} strokeWidth="1.6" strokeLinejoin="round" />
        <path d="M14 3v5h5" stroke={stroke} strokeWidth="1.6" strokeLinejoin="round" />
      </svg>
    );
  }
  if (kind === "export") {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden className="opacity-70">
        <path d="M12 4v10M8 10l4 4 4-4M5 18h14" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden className="opacity-50">
      <rect x="5" y="4" width="14" height="16" rx="1.5" stroke={stroke} strokeWidth="1.6" />
      <path d="M8 9h8M8 13h6" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
