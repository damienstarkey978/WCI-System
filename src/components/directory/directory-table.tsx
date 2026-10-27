import Link from "next/link";
import type { ReactNode } from "react";

import { SearchIcon, SortArrowsIcon } from "@/components/shell/icons";
import type { ActivationLabel } from "@/lib/directory/activation";
import { directoryHref, type DirectoryParams } from "@/lib/directory/params";

const PILL_STYLES: Record<ActivationLabel, string> = {
  Active: "bg-green-100 text-green-800 dark:bg-green-400/15 dark:text-green-300",
  Pending: "bg-amber-100 text-amber-800 dark:bg-amber-400/15 dark:text-amber-300",
  Inactive: "bg-gray-200 text-gray-700 dark:bg-white/10 dark:text-gray-300",
  "No Email": "bg-gray-200 text-gray-700 dark:bg-white/10 dark:text-gray-300",
};

/** Buildertrend's rounded status chip (Active / Pending / Inactive / No Email). */
export function ActivationPill({ label }: { label: ActivationLabel }) {
  return <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${PILL_STYLES[label]}`}>{label}</span>;
}

export interface DirectoryColumn<Row> {
  readonly key: string;
  readonly label: string;
  /** When set, the header links to ?sort=<sortKey> (toggling direction) — only for columns the page's query actually orders by. */
  readonly sortKey?: string;
  readonly className?: string;
  readonly render: (row: Row) => ReactNode;
}

/** GET form so a search is just a URL (?q=) — keeps the other params (filter, sort, page size) and resets to page 1. */
export function SearchForm({ params, placeholder }: { params: DirectoryParams; placeholder: string }) {
  return (
    <form method="get" role="search" className="flex items-center">
      {params.status ? <input type="hidden" name="status" value={params.status} /> : null}
      {params.sort ? <input type="hidden" name="sort" value={params.sort} /> : null}
      {params.dir === "desc" ? <input type="hidden" name="dir" value="desc" /> : null}
      <label className="relative flex items-center">
        <SearchIcon className="pointer-events-none absolute left-2.5 h-4 w-4 text-[var(--bt-muted)]" />
        <input
          type="search"
          name="q"
          defaultValue={params.query}
          placeholder={placeholder}
          aria-label={placeholder}
          className="h-9 w-44 rounded-md border bg-[var(--bt-panel-bg)] py-1.5 pl-8 pr-3 text-sm text-[var(--bt-text)] outline-none focus:border-[var(--bt-primary)] sm:w-52"
          style={{ borderColor: "var(--bt-border)" }}
        />
      </label>
    </form>
  );
}

/**
 * The list table all three People directories share — Buildertrend's grey header row
 * with a sort caret on the active column, light row dividers, blue name links. Server
 * component: sorting is a link (?sort=&dir=), so there's no client state here.
 */
export function DirectoryTable<Row>({
  basePath,
  params,
  columns,
  rows,
  rowKey,
  emptyMessage,
}: {
  basePath: string;
  params: DirectoryParams;
  columns: readonly DirectoryColumn<Row>[];
  rows: readonly Row[];
  rowKey: (row: Row) => string;
  emptyMessage: string;
}) {
  // Unsorted lists are ordered by their first sortable column (name), ascending — show that caret so the first click flips to descending.
  const activeSort = params.sort ?? columns.find((column) => column.sortKey !== undefined)?.sortKey;

  return (
    <div className="overflow-x-auto rounded-lg border bg-[var(--bt-panel-bg)]" style={{ borderColor: "var(--bt-border)" }}>
      <table className="w-full min-w-[56rem] text-left text-sm">
        <thead>
          <tr className="bg-[var(--bt-panel-bg-muted)]">
            {columns.map((column) => {
              const sorted = column.sortKey !== undefined && activeSort === column.sortKey;
              const nextDir = sorted && params.dir === "asc" ? "desc" : "asc";
              return (
                <th key={column.key} scope="col" className={`whitespace-nowrap px-3 py-3 font-bold text-[var(--bt-text)] ${column.className ?? ""}`} aria-sort={sorted ? (params.dir === "asc" ? "ascending" : "descending") : undefined}>
                  {column.sortKey !== undefined ? (
                    <Link href={directoryHref(basePath, params, { sort: column.sortKey, dir: nextDir, page: 1 })} className="inline-flex items-center gap-1 hover:underline">
                      {column.label}
                      {sorted ? (
                        <SortArrowsIcon className="h-3.5 w-3.5 text-[var(--bt-primary)]" />
                      ) : (
                        <SortArrowsIcon className="h-3.5 w-3.5 opacity-30" />
                      )}
                    </Link>
                  ) : (
                    column.label
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-3 py-10 text-center text-sm text-[var(--bt-muted)]">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={rowKey(row)} className="border-t align-top hover:bg-black/[0.03] dark:hover:bg-white/[0.03]" style={{ borderColor: "var(--bt-border)" }}>
                {columns.map((column) => (
                  <td key={column.key} className={`px-3 py-2.5 text-[var(--bt-text)] ${column.className ?? ""}`}>
                    {column.render(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
