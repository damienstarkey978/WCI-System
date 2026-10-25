"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";

import { FilterIcon } from "@/components/shell/icons";
import { directoryHref, PAGE_SIZES, totalPages, type DirectoryParams } from "@/lib/directory/params";

export interface DirectoryPanel {
  readonly id: string;
  readonly label: string;
  /** "primary" is the filled "+ Thing" button; "secondary" is the outlined one (Import). */
  readonly variant: "primary" | "secondary";
  readonly content: ReactNode;
}

/**
 * Page title row: the title, the server-rendered toolbar (search, filter) and the
 * action buttons. Each button opens its own panel (a create form, the import form)
 * directly under the title; opening one closes the other.
 */
export function DirectoryHeader({ title, toolbar, panels }: { title: string; toolbar?: ReactNode; panels: readonly DirectoryPanel[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const openPanel = panels.find((panel) => panel.id === openId);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold tracking-tight text-[var(--bt-text)]">{title}</h1>
        <div className="flex flex-wrap items-center gap-2">
          {toolbar}
          {panels.map((panel) => {
            const open = panel.id === openId;
            return (
              <button
                key={panel.id}
                type="button"
                onClick={() => setOpenId(open ? null : panel.id)}
                aria-expanded={open}
                className={
                  panel.variant === "primary"
                    ? "inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-semibold text-[var(--bt-on-primary)]"
                    : "inline-flex items-center gap-1.5 rounded-md border px-4 py-2 text-sm font-semibold text-[var(--bt-text)] hover:bg-black/5 dark:hover:bg-white/10"
                }
                style={panel.variant === "primary" ? { background: "var(--bt-primary)" } : { borderColor: "var(--bt-border)" }}
              >
                {panel.variant === "primary" ? (
                  <span aria-hidden="true" className="text-base leading-none">
                    {open ? "×" : "+"}
                  </span>
                ) : null}
                {panel.label}
              </button>
            );
          })}
        </div>
      </div>
      {openPanel ? <div>{openPanel.content}</div> : null}
    </div>
  );
}

export interface FilterOption {
  readonly label: string;
  readonly href: string;
  readonly active: boolean;
}

/** The funnel button: a small popover of status options. A filter in effect shows Buildertrend's "1" badge. */
export function FilterMenu({ options, activeCount }: { options: readonly FilterOption[]; activeCount: number }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        aria-label="Filter"
        aria-expanded={open}
        className="relative rounded-md p-2 text-[var(--bt-text)] hover:bg-black/5 dark:hover:bg-white/10"
      >
        <FilterIcon className="h-5 w-5" />
        {activeCount > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-sky-100 px-1 text-[10px] font-bold text-sky-800">{activeCount}</span>
        ) : null}
      </button>
      {open ? (
        <div className="absolute right-0 top-full z-20 mt-1 w-48 rounded-md border bg-[var(--bt-panel-bg)] py-1 text-sm shadow-lg" style={{ borderColor: "var(--bt-border)" }}>
          <div className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--bt-muted)]">Activation</div>
          {options.map((option) => (
            <Link key={option.label} href={option.href} onClick={() => setOpen(false)} className="flex items-center justify-between px-3 py-2 text-[var(--bt-text)] hover:bg-black/5 dark:hover:bg-white/10">
              {option.label}
              {option.active ? <span aria-hidden="true">✓</span> : null}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Bottom bar: "1-50 of 946 items  ‹  [1] / 19  ›  [50 / page]". */
export function Pagination({ basePath, params, totalCount }: { basePath: string; params: DirectoryParams; totalCount: number }) {
  const router = useRouter();
  const pages = totalPages(totalCount, params.pageSize);
  const page = Math.min(params.page, pages);
  const from = totalCount === 0 ? 0 : (page - 1) * params.pageSize + 1;
  const to = Math.min(page * params.pageSize, totalCount);

  const arrow = "inline-flex h-8 w-8 items-center justify-center rounded text-[var(--bt-text)]";

  return (
    <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2 text-sm text-[var(--bt-text)]">
      <span>
        {from}-{to} of {totalCount} items
      </span>
      <div className="flex items-center gap-1">
        {page > 1 ? (
          <Link href={directoryHref(basePath, params, { page: page - 1 })} aria-label="Previous page" className={`${arrow} hover:bg-black/5 dark:hover:bg-white/10`}>
            ‹
          </Link>
        ) : (
          <span aria-hidden="true" className={`${arrow} opacity-30`}>
            ‹
          </span>
        )}
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const value = Number(new FormData(event.currentTarget).get("page"));
            if (Number.isFinite(value)) router.push(directoryHref(basePath, params, { page: Math.min(Math.max(1, Math.floor(value)), pages) }));
          }}
        >
          <input
            key={page}
            name="page"
            inputMode="numeric"
            defaultValue={page}
            aria-label="Page number"
            className="h-8 w-12 rounded border bg-[var(--bt-panel-bg)] text-center text-sm outline-none focus:border-[var(--bt-primary)]"
            style={{ borderColor: "var(--bt-border)" }}
          />
        </form>
        <span>/ {pages}</span>
        {page < pages ? (
          <Link href={directoryHref(basePath, params, { page: page + 1 })} aria-label="Next page" className={`${arrow} text-[var(--bt-primary)] hover:bg-black/5 dark:hover:bg-white/10`}>
            ›
          </Link>
        ) : (
          <span aria-hidden="true" className={`${arrow} opacity-30`}>
            ›
          </span>
        )}
      </div>
      <select
        value={params.pageSize}
        aria-label="Rows per page"
        onChange={(event) => router.push(directoryHref(basePath, params, { pageSize: Number(event.target.value), page: 1 }))}
        className="h-8 rounded border bg-[var(--bt-panel-bg)] px-2 text-sm outline-none focus:border-[var(--bt-primary)]"
        style={{ borderColor: "var(--bt-border)" }}
      >
        {PAGE_SIZES.map((size) => (
          <option key={size} value={size}>
            {size} / page
          </option>
        ))}
      </select>
    </div>
  );
}
