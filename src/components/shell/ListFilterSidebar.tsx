"use client";

import { type ReactNode } from "react";

import { CloseIcon, FunnelIcon } from "./icons";

/**
 * Buildertrend-style right Filter drawer used on Sales lists (Lead Activities,
 * Lead Opportunities, …). The caller owns field state and Apply/Clear handlers;
 * this shell only provides the chrome (header, scroll body, footer buttons).
 */
export function ListFilterSidebar({
  open,
  onClose,
  title = "Filter",
  children,
  onClearAll,
  onApply,
  applyLabel = "Apply filter",
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  onClearAll: () => void;
  onApply: () => void;
  applyLabel?: string;
}) {
  if (!open) return null;

  return (
    <aside
      className="sticky top-0 flex max-h-[calc(100vh-3.5rem)] w-full shrink-0 flex-col self-start overflow-hidden border-l bg-[var(--bt-panel-bg)] sm:w-[300px]"
      style={{ borderColor: "var(--bt-border)" }}
      aria-label={title}
    >
      <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: "var(--bt-border)" }}>
        <h2 className="text-base font-semibold text-[var(--bt-text)]">{title}</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close filter"
          className="inline-flex h-8 w-8 items-center justify-center rounded text-[var(--bt-muted)] hover:bg-black/5"
        >
          <CloseIcon className="h-4 w-4" />
        </button>
      </div>
      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">{children}</div>
      <div className="flex items-center justify-between gap-3 border-t px-4 py-3" style={{ borderColor: "var(--bt-border)" }}>
        <button type="button" onClick={onClearAll} className="text-sm font-medium text-[var(--bt-primary)] hover:underline">
          Clear all
        </button>
        <button
          type="button"
          onClick={onApply}
          className="rounded px-4 py-2 text-sm font-semibold text-[var(--bt-on-primary)]"
          style={{ background: "var(--bt-primary)" }}
        >
          {applyLabel}
        </button>
      </div>
    </aside>
  );
}

/** Toolbar funnel that opens the filter drawer; shows an active-count badge like BT. */
export function ListFilterButton({
  activeCount,
  open,
  onClick,
}: {
  activeCount: number;
  open: boolean;
  onClick: () => void;
}) {
  const filterAccent = "var(--bt-chrome-filter, #5ba3d9)";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={open}
      aria-label={activeCount > 0 ? `Filter, ${activeCount} active` : "Filter"}
      className="relative inline-flex h-8 w-8 items-center justify-center rounded-md border bg-white transition"
      style={{
        borderColor: open || activeCount > 0 ? filterAccent : "var(--bt-border)",
        color: open || activeCount > 0 ? filterAccent : "var(--bt-chrome-filter-idle, #64748b)",
        background: open ? "color-mix(in srgb, #5ba3d9 12%, white)" : "white",
      }}
    >
      <FunnelIcon className="h-4 w-4" />
      {activeCount > 0 ? (
        <span
          className="absolute -right-1.5 -top-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold text-white"
          style={{ background: filterAccent }}
        >
          {activeCount}
        </span>
      ) : null}
    </button>
  );
}

export function FilterField({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-1.5" htmlFor={htmlFor}>
      <span className="flex items-center gap-1 text-xs font-semibold text-[var(--bt-text)]">
        {label}
        {hint ? (
          <span className="text-[var(--bt-muted)]" title={hint} aria-label={hint}>
            ⓘ
          </span>
        ) : null}
      </span>
      {children}
    </label>
  );
}

export const filterControlClassName =
  "w-full min-h-10 rounded border bg-[var(--bt-panel-bg)] px-2.5 py-1.5 text-sm text-[var(--bt-text)] outline-none focus:border-[var(--bt-primary)] sm:min-h-0";

export function filterControlStyle(): { borderColor: string } {
  return { borderColor: "var(--bt-border)" };
}
