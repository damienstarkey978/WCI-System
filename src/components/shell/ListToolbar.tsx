"use client";

import Link from "next/link";
import { type ReactNode } from "react";

import { GearIcon, HelpIcon, UploadIcon } from "./icons";
import { ListFilterButton } from "./ListFilterSidebar";

/**
 * Buildertrend list toolbar chrome: icon cluster (help / settings / export /
 * filter-with-badge) plus primary/secondary action buttons on the right.
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
          className="inline-flex h-9 w-9 items-center justify-center rounded border text-[var(--bt-muted)]"
          style={{ borderColor: "var(--bt-border)" }}
          title="Help"
          aria-hidden
        >
          <HelpIcon className="h-4 w-4" />
        </span>
        <span
          className="inline-flex h-9 w-9 items-center justify-center rounded border text-[var(--bt-muted)]"
          style={{ borderColor: "var(--bt-border)" }}
          title="Settings"
          aria-hidden
        >
          <GearIcon className="h-4 w-4" />
        </span>
        <span
          className="inline-flex h-9 w-9 items-center justify-center rounded border text-[var(--bt-muted)]"
          style={{ borderColor: "var(--bt-border)" }}
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
    "inline-flex min-h-10 items-center rounded border px-3 py-2 text-sm font-medium text-[var(--bt-text)] hover:bg-black/5 sm:min-h-0";
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
    "inline-flex min-h-10 items-center rounded px-3 py-2 text-sm font-semibold text-[var(--bt-on-primary)] sm:min-h-0";
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
