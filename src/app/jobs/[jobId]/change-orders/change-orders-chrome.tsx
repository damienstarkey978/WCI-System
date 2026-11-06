"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";

import {
  FilterField,
  filterControlClassName,
  filterControlStyle,
  ListFilterButton,
  ListFilterSidebar,
} from "@/components/shell/ListFilterSidebar";
import { countTruthyFilters } from "@/components/shell/list-filter-fields";

const STATUS_OPTIONS = [
  { value: "all", label: "All" },
  { value: "not_sent", label: "Not sent" },
  { value: "sent", label: "Sent / Pending" },
  { value: "past_due", label: "Past due" },
  { value: "approved", label: "Approved" },
  { value: "declined", label: "Declined" },
] as const;

/**
 * Change Orders list chrome — only working controls (Filter + Create).
 * No decorative Help/Settings/Export icons (Damien: zero inert UI).
 */
export function ChangeOrdersChrome({
  jobId,
  jobName,
  status,
  q,
  createAction,
  children,
}: {
  jobId: string;
  jobName: string;
  status: string;
  q: string;
  createAction: ReactNode;
  children: ReactNode;
}) {
  const router = useRouter();
  const [filterOpen, setFilterOpen] = useState(false);
  const [draft, setDraft] = useState({ status, q });

  const activeCount = countTruthyFilters([status !== "all", Boolean(q)]);

  function pushFilters(next: { status: string; q: string }) {
    const params = new URLSearchParams();
    if (next.status && next.status !== "all") params.set("status", next.status);
    if (next.q.trim()) params.set("q", next.q.trim());
    const qs = params.toString();
    router.push(qs ? `/jobs/${jobId}/change-orders?${qs}` : `/jobs/${jobId}/change-orders`);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs text-[var(--bt-muted)]">{jobName}</div>
          <h1 className="text-xl font-semibold text-[var(--bt-text)]">Change Orders</h1>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <ListFilterButton activeCount={activeCount} open={filterOpen} onClick={() => setFilterOpen((open) => !open)} />
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex min-h-10 items-center rounded-md border px-3 py-2 text-sm font-medium text-[var(--bt-text)] hover:bg-black/5 sm:min-h-0"
            style={{ borderColor: "var(--bt-border)" }}
          >
            Print
          </button>
          {createAction}
        </div>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row">
        <div className="flex min-w-0 flex-1 flex-col gap-4">{children}</div>

        <ListFilterSidebar
          open={filterOpen}
          onClose={() => setFilterOpen(false)}
          onClearAll={() => {
            setDraft({ status: "all", q: "" });
            pushFilters({ status: "all", q: "" });
            setFilterOpen(false);
          }}
          onApply={() => {
            pushFilters(draft);
            setFilterOpen(false);
          }}
        >
          <FilterField label="Status" htmlFor="co-status">
            <select
              id="co-status"
              value={draft.status}
              onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value }))}
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
          <FilterField label="Keyword" htmlFor="co-kw" hint="Title or CO #">
            <input
              id="co-kw"
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
