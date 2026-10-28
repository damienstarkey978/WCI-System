"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";

import { sortRows } from "./data-grid-sort";
import { CheckIcon, SortArrowsIcon } from "./icons";

export interface DataGridColumn<T> {
  readonly key: string;
  readonly header: string;
  readonly align?: "left" | "right" | "center";
  readonly sortable?: boolean;
  /** What to sort by. Defaults to row[key] when that is a string or number. */
  readonly sortValue?: (row: T) => string | number | null;
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
 * Sorting: clicking a sortable header sorts `rows` in place (ascending, then
 * descending) using the column's `sortValue`, falling back to row[key]. A caller that
 * wants to own sorting passes `sort`/`onSortChange` instead and gets the click only.
 *
 * Column chooser / "Standard View": pass `viewKey` and the grid shows a Standard View
 * menu where columns can be hidden. The choice is remembered per browser in
 * localStorage under that key. It is not shared across devices or users; a server
 * saved view would need its own table, which nothing has asked for yet.
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
  rowHref,
  emptyMessage = "No results.",
  pageSize: initialPageSize = 50,
  viewKey,
  defaultHiddenKeys = [],
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
  /** Makes the whole row open this href (clicks on links/buttons/inputs are ignored). */
  rowHref?: (row: T) => string | null;
  emptyMessage?: string;
  pageSize?: number;
  /** Enables the Standard View column chooser, remembered per browser under this key. */
  viewKey?: string;
  /**
   * Columns hidden in Standard View until the user opts them back on. Used when the
   * Buildertrend default is a short column set but WCI still keeps the extras available.
   */
  defaultHiddenKeys?: readonly string[];
}) {
  const router = useRouter();
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState<number>(initialPageSize);

  // Selection and sort are controlled when the caller passes them, otherwise kept here,
  // so a grid that just says `selectable` still has working checkboxes and sortable headers.
  const [ownSelected, setOwnSelected] = useState<ReadonlySet<string>>(new Set());
  const [ownSort, setOwnSort] = useState<{ key: string; direction: "asc" | "desc" } | null>(null);
  const [hiddenKeys, setHiddenKeys] = useState<readonly string[]>(() => [...defaultHiddenKeys]);
  const [chooserOpen, setChooserOpen] = useState(false);
  const [hasSavedView, setHasSavedView] = useState(false);

  const storageKey = viewKey ? `wci.grid.${viewKey}` : null;
  // Join so an inline defaultHiddenKeys={[...]} from the caller does not re-fire the effect every render.
  const defaultHiddenKey = defaultHiddenKeys.join("\0");
  useEffect(() => {
    // Reading localStorage (and applying Standard View defaults) can only happen after mount.
    const defaults = defaultHiddenKey.length > 0 ? defaultHiddenKey.split("\0") : [];
    /* eslint-disable react-hooks/set-state-in-effect -- hydrate column visibility from localStorage after mount */
    if (!storageKey) {
      setHiddenKeys(defaults);
      setHasSavedView(false);
      return;
    }
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw === null) {
        setHiddenKeys(defaults);
        setHasSavedView(false);
        return;
      }
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        setHiddenKeys(parsed.filter((value): value is string => typeof value === "string"));
        setHasSavedView(true);
      }
    } catch {
      // Storage can be blocked or hold junk; fall back to the Buildertrend default.
      setHiddenKeys(defaults);
      setHasSavedView(false);
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [storageKey, defaultHiddenKey]);

  function saveHidden(next: readonly string[]) {
    setHiddenKeys(next);
    setHasSavedView(true);
    if (!storageKey) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      // Not remembered this time; the choice still applies for this visit.
    }
  }

  function resetToStandardView() {
    setHiddenKeys([...defaultHiddenKeys]);
    setHasSavedView(false);
    if (!storageKey) return;
    try {
      window.localStorage.removeItem(storageKey);
    } catch {
      // Still resets for this visit.
    }
  }

  const visibleColumns = columns.filter((column) => !hiddenKeys.includes(column.key));
  const effectiveSelected = selectedKeys ?? ownSelected;
  const effectiveSort = sort ?? ownSort;

  const sortedRows = useMemo(() => {
    if (!effectiveSort || sort) return rows; // a controlled `sort` means the caller already ordered the rows
    const column = columns.find((candidate) => candidate.key === effectiveSort.key);
    if (!column) return rows;
    const valueOf = (row: T): string | number | null => {
      if (column.sortValue) return column.sortValue(row);
      const raw = (row as Record<string, unknown>)[column.key];
      return typeof raw === "string" || typeof raw === "number" ? raw : null;
    };
    return sortRows(rows, valueOf, effectiveSort.direction);
  }, [rows, columns, effectiveSort, sort]);

  function handleSort(key: string) {
    if (onSortChange) onSortChange(key);
    if (sort) return;
    setOwnSort((current) => (current?.key === key && current.direction === "asc" ? { key, direction: "desc" } : { key, direction: "asc" }));
    setPage(0);
  }

  function updateSelected(next: ReadonlySet<string>) {
    onSelectedKeysChange?.(next);
    if (!selectedKeys) setOwnSelected(next);
  }

  const pageCount = Math.max(1, Math.ceil(sortedRows.length / pageSize));
  const clampedPage = Math.min(page, pageCount - 1);
  const pageRows = useMemo(() => sortedRows.slice(clampedPage * pageSize, clampedPage * pageSize + pageSize), [sortedRows, clampedPage, pageSize]);

  const allOnPageSelected = selectable && pageRows.length > 0 && pageRows.every((row) => effectiveSelected.has(rowKey(row)));

  function toggleRow(key: string) {
    const next = new Set(effectiveSelected);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    updateSelected(next);
  }

  function toggleAllOnPage() {
    const next = new Set(effectiveSelected);
    if (allOnPageSelected) {
      for (const row of pageRows) next.delete(rowKey(row));
    } else {
      for (const row of pageRows) next.add(rowKey(row));
    }
    updateSelected(next);
  }

  if (rows.length === 0) {
    return <p className="rounded-lg border bg-[var(--bt-panel-bg)] px-4 py-10 text-center text-sm text-[var(--bt-muted)]" style={{ borderColor: "var(--bt-border)" }}>{emptyMessage}</p>;
  }

  const alignClass = (align: DataGridColumn<T>["align"]) => (align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left");

  return (
    <div className="overflow-hidden rounded-lg border bg-[var(--bt-panel-bg)]" style={{ borderColor: "var(--bt-border)" }}>
      {viewKey ? (
        <div className="relative flex items-center justify-end border-b px-3 py-2" style={{ borderColor: "var(--bt-border)" }}>
          <button
            type="button"
            onClick={() => setChooserOpen((open) => !open)}
            aria-expanded={chooserOpen}
            className="rounded border px-3 py-1 text-xs font-medium text-[var(--bt-text)]"
            style={{ borderColor: "var(--bt-border)" }}
          >
            {hasSavedView ? "Custom view" : "Standard view"}
          </button>
          {chooserOpen ? (
            <div className="absolute right-3 top-full z-20 mt-1 w-56 rounded-lg border bg-[var(--bt-panel-bg)] p-2 shadow-lg" style={{ borderColor: "var(--bt-border)" }}>
              <div className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--bt-muted)]">Columns</div>
              {columns.map((column) => {
                const shown = !hiddenKeys.includes(column.key);
                return (
                  <label key={column.key} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-black/5">
                    <input
                      type="checkbox"
                      checked={shown}
                      onChange={() => {
                        // Never let the last visible column be hidden, or the grid would be blank.
                        if (shown && visibleColumns.length === 1) return;
                        saveHidden(shown ? [...hiddenKeys, column.key] : hiddenKeys.filter((key) => key !== column.key));
                      }}
                    />
                    {column.header || column.key}
                  </label>
                );
              })}
              {hasSavedView ? (
                <button type="button" onClick={resetToStandardView} className="mt-1 w-full rounded px-2 py-1 text-left text-xs font-medium text-[var(--bt-primary)] hover:bg-black/5">
                  Back to Standard view
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
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
              {visibleColumns.map((column) => (
                <th key={column.key} className={`px-4 py-3 ${alignClass(column.align)}`}>
                  {column.sortable ? (
                    <button type="button" onClick={() => handleSort(column.key)} className="inline-flex items-center gap-1 hover:text-[var(--bt-text)]">
                      {column.header}
                      <SortArrowsIcon className={`h-3 w-3 ${effectiveSort?.key === column.key ? "text-[var(--bt-primary)]" : ""}`} />
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
              const isSelected = effectiveSelected.has(key);
              const href = rowHref?.(row) ?? null;
              const openRow = () => {
                if (href) router.push(href);
              };
              const onRowClick = (event: MouseEvent<HTMLTableRowElement>) => {
                if (!href) return;
                const target = event.target as HTMLElement;
                if (target.closest("a, button, input, select, textarea, label")) return;
                openRow();
              };
              const onRowKeyDown = (event: KeyboardEvent<HTMLTableRowElement>) => {
                if (!href) return;
                if (event.key !== "Enter" && event.key !== " ") return;
                const target = event.target as HTMLElement;
                if (target !== event.currentTarget) return;
                event.preventDefault();
                openRow();
              };
              return (
                <tr
                  key={key}
                  className={`border-b last:border-0 ${href ? "cursor-pointer hover:bg-black/[0.03] dark:hover:bg-white/[0.04]" : ""}`}
                  style={{ borderColor: "var(--bt-border)" }}
                  onClick={onRowClick}
                  onKeyDown={onRowKeyDown}
                  tabIndex={href ? 0 : undefined}
                  role={href ? "link" : undefined}
                >
                  {selectable ? (
                    <td className="px-3 py-3">
                      <button type="button" onClick={() => toggleRow(key)} aria-label="Select row" aria-checked={isSelected} role="checkbox" className="flex h-4 w-4 items-center justify-center rounded border" style={{ borderColor: "var(--bt-border)", background: isSelected ? "var(--bt-primary)" : "transparent" }}>
                        {isSelected ? <CheckIcon className="h-3 w-3 text-[var(--bt-on-primary)]" /> : null}
                      </button>
                    </td>
                  ) : null}
                  {visibleColumns.map((column) => (
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
                {visibleColumns.map((column) => (
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
          {clampedPage * pageSize + 1}-{Math.min(sortedRows.length, clampedPage * pageSize + pageRows.length)} of {sortedRows.length} items{effectiveSelected.size > 0 ? `, ${effectiveSelected.size} selected` : ""}
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
