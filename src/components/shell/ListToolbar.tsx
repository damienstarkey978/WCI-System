"use client";

import Link from "next/link";
import { type ReactNode } from "react";

import { GearIcon, HelpIcon, UploadIcon } from "./icons";
import { ListFilterButton } from "./ListFilterSidebar";

/**
 * Buildertrend list toolbar chrome: icon cluster (help / settings / export /
 * filter-with-badge) plus primary/secondary action buttons on the right.
 *
 * Icon glyphs use BT's multi-color affordances (blue / violet / green / sky),
 * not a monochrome brand-teal wash — primary CTA still uses WCI `--bt-primary`.
 */
export function ListToolbar({
  filterOpen,
  filterActiveCount,
  onFilterClick,
  secondaryAction,
  primaryAction,
  extraIcons,
}: {
  filterOpen: boolean;
  filterActiveCount: number;
  onFilterClick: () => void;
  secondaryAction?: ReactNode;
  primaryAction?: ReactNode;
  extraIcons?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <div className="flex items-center gap-1">
        <span
          className="inline-flex h-8 w-8 items-center justify-center rounded-md border bg-white"
          style={{ borderColor: "var(--bt-border)", color: "var(--bt-chrome-help, #3b82f6)" }}
          title="Help"
          aria-hidden
        >
          <HelpIcon className="h-4 w-4" />
        </span>
        <span
          className="inline-flex h-8 w-8 items-center justify-center rounded-md border bg-white"
          style={{ borderColor: "var(--bt-border)", color: "var(--bt-chrome-settings, #8b5cf6)" }}
          title="Settings"
          aria-hidden
        >
          <GearIcon className="h-4 w-4" />
        </span>
        <span
          className="inline-flex h-8 w-8 items-center justify-center rounded-md border bg-white"
          style={{ borderColor: "var(--bt-border)", color: "var(--bt-chrome-export, #16a34a)" }}
          title="Export"
          aria-hidden
        >
          <UploadIcon className="h-4 w-4" />
        </span>
        {extraIcons}
        <ListFilterButton activeCount={filterActiveCount} open={filterOpen} onClick={onFilterClick} />
      </div>
      {secondaryAction}
      {primaryAction}
    </div>
  );
}

export function ListToolbarSecondaryButton({
  href,
  children,
  onClick,
}: {
  href?: string;
  children: ReactNode;
  onClick?: () => void;
}) {
  const className =
    "inline-flex min-h-10 items-center rounded-md border px-3 py-2 text-sm font-medium text-[var(--bt-text)] hover:bg-black/5 sm:min-h-0";
  const style = { borderColor: "var(--bt-border)" };
  if (href) {
    return (
      <Link href={href} className={className} style={style}>
        {children}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={className} style={style}>
      {children}
    </button>
  );
}

export function ListToolbarPrimaryButton({
  href,
  children,
  onClick,
}: {
  href?: string;
  children: ReactNode;
  onClick?: () => void;
}) {
  const className =
    "inline-flex min-h-10 items-center rounded-md px-3 py-2 text-sm font-semibold text-[var(--bt-on-primary)] sm:min-h-0";
  const style = { background: "var(--bt-primary)" };
  if (href) {
    return (
      <Link href={href} className={className} style={style}>
        {children}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={className} style={style}>
      {children}
    </button>
  );
}
