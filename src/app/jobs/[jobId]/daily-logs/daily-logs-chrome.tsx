"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";

import { InfoIcon, SearchIcon } from "@/components/shell/icons";
import {
  FilterField,
  filterControlClassName,
  filterControlStyle,
  ListFilterSidebar,
} from "@/components/shell/ListFilterSidebar";
import { ListToolbar } from "@/components/shell/ListToolbar";
import { countTruthyFilters } from "@/components/shell/list-filter-fields";

import { PrintButton } from "./print-button";

/**
 * Buildertrend Daily Logs list chrome: Search field + multi-color Help/Settings/
 * Export/Info + Filter drawer (keyword + date range), Print, and + Daily Log.
 * Filters still apply via URL search params so the server page keeps paging.
 * Remount with a key when URL filters change so draft state resets without an effect.
 */
export function DailyLogsChrome({
  jobId,
  jobName,
  q,
  from,
  to,
  createAction,
  children,
}: {
  jobId: string;
  jobName: string;
  q: string;
  from: string;
  to: string;
  createAction: ReactNode;
  children: ReactNode;
}) {
  const router = useRouter();
  const [filterOpen, setFilterOpen] = useState(false);
  const [draft, setDraft] = useState({ q, from, to });

  const activeCount = countTruthyFilters([Boolean(q), Boolean(from), Boolean(to)]);

  function pushFilters(next: { q: string; from: string; to: string }) {
    const params = new URLSearchParams();
    if (next.q.trim()) params.set("q", next.q.trim());
    if (next.from) params.set("from", next.from);
    if (next.to) params.set("to", next.to);
    const qs = params.toString();
    router.push(qs ? `/jobs/${jobId}/daily-logs?${qs}` : `/jobs/${jobId}/daily-logs`);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs text-[var(--bt-muted)]">{jobName}</div>
          <h1 className="text-xl font-semibold text-[var(--bt-text)]">Daily Logs</h1>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              pushFilters({
                q: String(data.get("q") ?? ""),
                from,
                to,
              });
            }}
            className="relative hidden sm:block"
          >
            <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--bt-muted)]" />
            <input
              name="q"
              defaultValue={q}
              placeholder="Search"
              aria-label="Search daily logs"
              className="h-9 w-44 rounded border bg-[var(--bt-panel-bg)] pl-8 pr-2 text-sm text-[var(--bt-text)] placeholder:text-[var(--bt-muted)]"
              style={{ borderColor: "var(--bt-border)" }}
            />
          </form>
          <ListToolbar
            filterOpen={filterOpen}
            filterActiveCount={activeCount}
            onFilterClick={() => setFilterOpen((open) => !open)}
            extraIcons={
              <span
                className="inline-flex h-8 w-8 items-center justify-center rounded-md border bg-white"
                style={{ borderColor: "var(--bt-border)", color: "var(--bt-chrome-info, #0ea5e9)" }}
                title="Info"
                aria-hidden
              >
                <InfoIcon className="h-4 w-4" />
              </span>
            }
            secondaryAction={<PrintButton />}
            primaryAction={createAction}
          />
        </div>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row">
        <div className="flex min-w-0 flex-1 flex-col gap-4">{children}</div>

        <ListFilterSidebar
          open={filterOpen}
          onClose={() => setFilterOpen(false)}
          onClearAll={() => {
            setDraft({ q: "", from: "", to: "" });
            pushFilters({ q: "", from: "", to: "" });
            setFilterOpen(false);
          }}
          onApply={() => {
            pushFilters(draft);
            setFilterOpen(false);
          }}
        >
          <FilterField label="Keyword" htmlFor="daily-logs-kw" hint="Title and notes">
            <input
              id="daily-logs-kw"
              value={draft.q}
              onChange={(event) => setDraft((current) => ({ ...current, q: event.target.value }))}
              className={filterControlClassName}
              style={filterControlStyle()}
            />
          </FilterField>
          <FilterField label="From" htmlFor="daily-logs-from">
            <input
              id="daily-logs-from"
              type="date"
              value={draft.from}
              onChange={(event) => setDraft((current) => ({ ...current, from: event.target.value }))}
              className={filterControlClassName}
              style={filterControlStyle()}
            />
          </FilterField>
          <FilterField label="To" htmlFor="daily-logs-to">
            <input
              id="daily-logs-to"
              type="date"
              value={draft.to}
              onChange={(event) => setDraft((current) => ({ ...current, to: event.target.value }))}
              className={filterControlClassName}
              style={filterControlStyle()}
            />
          </FilterField>
        </ListFilterSidebar>
      </div>
    </div>
  );
}
