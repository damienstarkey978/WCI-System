"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";

import { InfoIcon } from "@/components/shell/icons";
import {
  FilterField,
  filterControlClassName,
  filterControlStyle,
  ListFilterSidebar,
} from "@/components/shell/ListFilterSidebar";
import { ListToolbar } from "@/components/shell/ListToolbar";
import { countTruthyFilters } from "@/components/shell/list-filter-fields";

const STATUS_OPTIONS = [
  { value: "all", label: "All RFIs" },
  { value: "open", label: "Open" },
  { value: "answered", label: "Answered" },
  { value: "closed", label: "Closed" },
] as const;

/**
 * Buildertrend RFIs list chrome: multi-color Help/Settings/Export/Info + Filter
 * drawer (status + keyword) beside + RFI. Filters apply via URL search params so
 * the server page keeps owning the query. Remount with a key when URL filters
 * change so draft state resets without an effect.
 */
export function RfisChrome({
  jobId,
  jobName,
  tab,
  q,
  createAction,
  children,
}: {
  jobId: string;
  jobName: string;
  tab: string;
  q: string;
  createAction: ReactNode;
  children: ReactNode;
}) {
  const router = useRouter();
  const [filterOpen, setFilterOpen] = useState(false);
  const [draft, setDraft] = useState({ tab, q });

  const activeCount = countTruthyFilters([tab !== "all", Boolean(q)]);

  function pushFilters(next: { tab: string; q: string }) {
    const params = new URLSearchParams();
    if (next.tab && next.tab !== "all") params.set("tab", next.tab);
    if (next.q.trim()) params.set("q", next.q.trim());
    const qs = params.toString();
    router.push(qs ? `/jobs/${jobId}/rfis?${qs}` : `/jobs/${jobId}/rfis`);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs text-[var(--bt-muted)]">{jobName}</div>
          <h1 className="text-xl font-semibold text-[var(--bt-text)]">RFIs</h1>
        </div>
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
          primaryAction={createAction}
        />
      </div>

      <div className="flex flex-col gap-3 lg:flex-row">
        <div className="flex min-w-0 flex-1 flex-col gap-4">{children}</div>

        <ListFilterSidebar
          open={filterOpen}
          onClose={() => setFilterOpen(false)}
          onClearAll={() => {
            setDraft({ tab: "all", q: "" });
            pushFilters({ tab: "all", q: "" });
            setFilterOpen(false);
          }}
          onApply={() => {
            pushFilters(draft);
            setFilterOpen(false);
          }}
        >
          <FilterField label="Status" htmlFor="rfis-status">
            <select
              id="rfis-status"
              value={draft.tab}
              onChange={(event) => setDraft((current) => ({ ...current, tab: event.target.value }))}
              className={filterControlClassName}
              style={filterControlStyle()}
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </FilterField>
          <FilterField label="Keyword" htmlFor="rfis-kw" hint="Title and question">
            <input
              id="rfis-kw"
              value={draft.q}
              onChange={(event) => setDraft((current) => ({ ...current, q: event.target.value }))}
              className={filterControlClassName}
              style={filterControlStyle()}
            />
          </FilterField>
        </ListFilterSidebar>
      </div>
    </div>
  );
}
