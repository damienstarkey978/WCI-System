"use client";

import { useMemo, useState, type ReactNode } from "react";

import { CheckIcon, SortArrowsIcon } from "./icons";

export interface DataGridColumn<T> {
  readonly key: string;
  readonly header: string;
  readonly align?: "left" | "right" | "center";
  readonly sortable?: boolean;
  readonly render: (row: T) => ReactNode;
  /** Rendered in the totals row, under this column. Omit columns that have no total. */
  readonly total?: ReactNode;
}

const PAGE_SIZE_OPTIONS = [25, 50, 100] as const;

/**
 * Buildertrend's grid chrome (checkbox column + select all, sortable headers,
 * sticky header, page-size dropdown + "X-Y of Z items" footer, totals row) as one
 * shared component — every financial/PM list page is meant to render through this
 * rather than its own one-off <table>.
 *
 * Deliberately NOT in scope yet: the column chooser and the "Standard View" saved-
 * view dropdown. Both need a real per-page column spec (which columns exist to
 * choose from) and, for saved views, somewhere to persist the choice — those get
 * designed against an actual page's real columns when that page is wired up
 * (Steps 3-8), not invented generically here.
 *
 * Sorting is presentational only: `onSortChange` just tells the caller which
 * column/direction was clicked. This component doesn't sort `rows` itself, since
 * for most of these pages the "right" sort (e.g. by money, by a nested field) needs
 * real comparator logic the caller already has reasons to own.
 */
export function DataGrid<T>({
  columns,
  rows,
  rowKey,
  selectable = false,
  selectedKeys,
  onSelectedKeysChange,
  sort,
  onSortChange,
  showTotals = false,
  rowActions,
  emptyMessage = "No results.",
  pageSize: initialPageSize = 50,
}: {
  columns: readonly DataGridColumn<T>[];
  rows: readonly T[];
  rowKey: (row: T) => string;
  selectable?: boolean;
  selectedKeys?: ReadonlySet<string>;
  onSelectedKeysChange?: (keys: ReadonlySet<string>) => void;
  sort?: { key: string; direction: "asc" | "desc" };
  onSortChange?: (key: string) => void;
  showTotals?: boolean;
  rowActions?: (row: T) => ReactNode;
  emptyMessage?: string;
  pageSize?: number;
}) {
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState<number>(initialPageSize);

  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const clampedPage = Math.min(page, pageCount - 1);
  const pageRows = useMemo(() => rows.slice(clampedPage * pageSize, clampedPage * pageSize + pageSize), [rows, clampedPage, pageSize]);

  const allOnPageSelected = selectable && pageRows.length > 0 && pageRows.every((row) => selectedKeys?.has(rowKey(row)));

  function toggleRow(key: string) {
    if (!onSelectedKeysChange) return;
    const next = new Set(selectedKeys ?? []);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onSelectedKeysChange(next);
  }

  function toggleAllOnPage() {
    if (!onSelectedKeysChange) return;
    const next = new Set(selectedKeys ?? []);
    if (allOnPageSelected) {
      for (const row of pageRows) next.delete(rowKey(row));
    } else {
      for (const row of pageRows) next.add(rowKey(row));
    }
    onSelectedKeysChange(next);
  }

  if (rows.length === 0) {
    return <p className="rounded-lg border bg-[var(--bt-panel-bg)] px-4 py-10 text-center text-sm text-[var(--bt-muted)]" style={{ borderColor: "var(--bt-border)" }}>{emptyMessage}</p>;
  }

  const alignClass = (align: DataGridColumn<T>["align"]) => (align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left");

  return (
    <div className="overflow-hidden rounded-lg border bg-[var(--bt-panel-bg)]" style={{ borderColor: "var(--bt-border)" }}>
      <div className="max-h-[36rem] overflow-auto">
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 z-10 bg-[var(--bt-panel-bg)]">
            <tr className="border-b text-xs font-semibold uppercase tracking-wide text-[var(--bt-muted)]" style={{ borderColor: "var(--bt-border)" }}>
              {selectable ? (
                <th className="w-10 px-3 py-3">
                  <button type="button" onClick={toggleAllOnPage} aria-label="Select all" aria-checked={allOnPageSelected} role="checkbox" className="flex h-4 w-4 items-center justify-center rounded border" style={{ borderColor: "var(--bt-border)", background: allOnPageSelected ? "var(--bt-primary)" : "transparent" }}>
                    {allOnPageSelected ? <CheckIcon className="h-3 w-3 text-[var(--bt-on-primary)]" /> : null}
                  </button>
                </th>
              ) : null}
              {columns.map((column) => (
                <th key={column.key} className={`px-4 py-3 ${alignClass(column.align)}`}>
                  {column.sortable ? (
                    <button type="button" onClick={() => onSortChange?.(column.key)} className="inline-flex items-center gap-1 hover:text-[var(--bt-text)]">
                      {column.header}
                      <SortArrowsIcon className={`h-3 w-3 ${sort?.key === column.key ? "text-[var(--bt-primary)]" : ""}`} />
                    </button>
                  ) : (
                    column.header
                  )}
                </th>
              ))}
              {rowActions ? <th className="px-4 py-3" /> : null}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row) => {
              const key = rowKey(row);
              const isSelected = selectedKeys?.has(key) ?? false;
              return (
                <tr key={key} className="border-b last:border-0" style={{ borderColor: "var(--bt-border)" }}>
                  {selectable ? (
                    <td className="px-3 py-3">
                      <button type="button" onClick={() => toggleRow(key)} aria-label="Select row" aria-checked={isSelected} role="checkbox" className="flex h-4 w-4 items-center justify-center rounded border" style={{ borderColor: "var(--bt-border)", background: isSelected ? "var(--bt-primary)" : "transparent" }}>
                        {isSelected ? <CheckIcon className="h-3 w-3 text-[var(--bt-on-primary)]" /> : null}
                      </button>
                    </td>
                  ) : null}
                  {columns.map((column) => (
                    <td key={column.key} className={`px-4 py-3 text-[var(--bt-text)] ${alignClass(column.align)}`}>
                      {column.render(row)}
                    </td>
                  ))}
                  {rowActions ? <td className="px-4 py-3 text-right">{rowActions(row)}</td> : null}
                </tr>
              );
            })}
          </tbody>
          {showTotals ? (
            <tfoot>
              <tr className="border-t text-sm font-semibold" style={{ borderColor: "var(--bt-border)" }}>
                {selectable ? <td className="px-3 py-3" /> : null}
                {columns.map((column) => (
                  <td key={column.key} className={`px-4 py-3 text-[var(--bt-text)] ${alignClass(column.align)}`}>
                    {column.total}
                  </td>
                ))}
                {rowActions ? <td className="px-4 py-3" /> : null}
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-2.5 text-xs text-[var(--bt-muted)]" style={{ borderColor: "var(--bt-border)" }}>
        <span>
          {clampedPage * pageSize + 1}-{Math.min(rows.length, clampedPage * pageSize + pageRows.length)} of {rows.length} items
        </span>
        <div className="flex items-center gap-2">
          <select
            value={pageSize}
            onChange={(event) => {
              setPageSize(Number(event.target.value));
              setPage(0);
            }}
            className="rounded border px-2 py-1 text-xs outline-none focus:border-[var(--bt-primary)]"
            style={{ borderColor: "var(--bt-border)" }}
          >
            {PAGE_SIZE_OPTIONS.map((size) => (
              <option key={size} value={size}>
                {size} / page
              </option>
            ))}
          </select>
          <button type="button" disabled={clampedPage === 0} onClick={() => setPage((value) => Math.max(0, value - 1))} className="rounded border px-2 py-1 disabled:opacity-40" style={{ borderColor: "var(--bt-border)" }}>
            Prev
          </button>
          <button type="button" disabled={clampedPage >= pageCount - 1} onClick={() => setPage((value) => Math.min(pageCount - 1, value + 1))} className="rounded border px-2 py-1 disabled:opacity-40" style={{ borderColor: "var(--bt-border)" }}>
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
