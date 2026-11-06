"use client";

import Link from "next/link";
import { type ReactNode } from "react";

import { ListFilterButton } from "./ListFilterSidebar";

/**
 * Buildertrend list toolbar: working Filter (+ optional extraIcons) and
 * primary/secondary actions. Decorative Help/Settings/Export placeholders are
 * omitted until those actions are implemented (Damien: zero inert UI).
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
