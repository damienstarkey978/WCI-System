"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { EmptyState } from "@/components/shell/EmptyState";
import { DocumentIcon } from "@/components/shell/icons";
import {
  FilterField,
  filterControlClassName,
  filterControlStyle,
  ListFilterSidebar,
} from "@/components/shell/ListFilterSidebar";
import { ListToolbar, ListToolbarPrimaryButton } from "@/components/shell/ListToolbar";

import { LeadProposalsGrid, type LeadProposalRow } from "./proposals-grid";

const STATUSES = [
  { value: "DRAFT", label: "Draft" },
  { value: "SENT", label: "Sent" },
  { value: "ACCEPTED", label: "Accepted" },
  { value: "DECLINED", label: "Declined" },
] as const;

const DATE_PRESETS = [
  { value: "all", label: "All dates" },
  { value: "today", label: "Today" },
  { value: "last7", label: "Last 7 days" },
  { value: "last30", label: "Last 30 days" },
  { value: "last90", label: "Last 90 days" },
] as const;

interface DraftFilters {
  keyword: string;
  statuses: string[];
  createdDate: string;
}

const EMPTY_FILTERS: DraftFilters = {
  keyword: "",
  statuses: [],
  createdDate: "all",
};

function countActiveFilters(f: DraftFilters): number {
  let n = 0;
  if (f.keyword.trim()) n += 1;
  if (f.statuses.length > 0) n += 1;
  if (f.createdDate !== "all") n += 1;
  return n;
}

function matchesDatePreset(iso: string, preset: string, now = Date.now()): boolean {
  if (preset === "all") return true;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return false;
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const todayMs = startOfToday.getTime();
  const day = 86_400_000;
  switch (preset) {
    case "today":
      return t >= todayMs && t < todayMs + day;
    case "last7":
      return t >= now - 7 * day && t <= now;
    case "last30":
      return t >= now - 30 * day && t <= now;
    case "last90":
      return t >= now - 90 * day && t <= now;
    default:
      return true;
  }
}

function toggleInList(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

function MultiSelectChips({
  options,
  selected,
  onChange,
  emptyLabel = "All",
}: {
  options: readonly { value: string; label: string }[];
  selected: string[];
  onChange: (next: string[]) => void;
  emptyLabel?: string;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex min-h-10 flex-wrap gap-1.5 rounded border px-2 py-1.5 sm:min-h-0" style={filterControlStyle()}>
        {selected.length === 0 ? <span className="text-sm text-[var(--bt-muted)]">{emptyLabel}</span> : null}
        {selected.map((value) => {
          const label = options.find((o) => o.value === value)?.label ?? value;
          return (
            <button
              key={value}
              type="button"
              onClick={() => onChange(toggleInList(selected, value))}
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium text-[var(--bt-on-primary)]"
              style={{ background: "var(--bt-primary)" }}
            >
              {label}
              <span aria-hidden>×</span>
            </button>
          );
        })}
      </div>
      <select
        className={filterControlClassName}
        style={filterControlStyle()}
        value=""
        onChange={(event) => {
          const value = event.target.value;
          if (!value) return;
          if (!selected.includes(value)) onChange([...selected, value]);
          event.target.value = "";
        }}
        aria-label="Add filter value"
      >
        <option value="">Add…</option>
        {options
          .filter((o) => !selected.includes(o.value))
          .map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
      </select>
    </div>
  );
}

/** Lead Proposals org list — same Filter sidebar chrome as Activities / Opportunities. */
export function LeadProposalsClient({ rows }: { rows: readonly LeadProposalRow[] }) {
  const [filterOpen, setFilterOpen] = useState(false);
  const [draft, setDraft] = useState<DraftFilters>(EMPTY_FILTERS);
  const [applied, setApplied] = useState<DraftFilters>(EMPTY_FILTERS);

  const filtered = useMemo(() => {
    const kw = applied.keyword.trim().toLowerCase();
    return rows.filter((row) => {
      if (kw) {
        const hay = `${row.title} ${row.leadName ?? ""} ${row.status}`.toLowerCase();
        if (!hay.includes(kw)) return false;
      }
      if (applied.statuses.length > 0 && !applied.statuses.includes(row.status)) return false;
      if (!matchesDatePreset(row.createdAt, applied.createdDate)) return false;
      return true;
    });
  }, [rows, applied]);

  const activeCount = countActiveFilters(applied);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col gap-3 p-4 sm:gap-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-semibold text-[var(--bt-text)]">Lead Proposals</h1>
          <ListToolbar
            filterOpen={filterOpen}
            filterActiveCount={activeCount}
            onFilterClick={() => setFilterOpen((open) => !open)}
            primaryAction={<ListToolbarPrimaryButton href="/leads">+ Proposal from lead</ListToolbarPrimaryButton>}
          />
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-3 lg:flex-row">
          <div className="min-w-0 flex-1">
            {rows.length === 0 ? (
              <EmptyState
                icon={<DocumentIcon className="h-10 w-10" />}
                title="No proposals yet"
                description="Open a lead and use the Proposals tab to draft one — they all show up here."
                action={
                  <Link href="/leads" className="text-sm font-medium text-[var(--bt-primary)] hover:underline">
                    Go to Lead Opportunities
                  </Link>
                }
              />
            ) : (
              <LeadProposalsGrid rows={filtered} />
            )}
          </div>

          <ListFilterSidebar
            open={filterOpen}
            onClose={() => setFilterOpen(false)}
            onClearAll={() => {
              setDraft(EMPTY_FILTERS);
              setApplied(EMPTY_FILTERS);
            }}
            onApply={() => {
              setApplied(draft);
              setFilterOpen(false);
            }}
          >
            <FilterField label="Keyword" htmlFor="lp-keyword" hint="Searches title, lead name, status">
              <input
                id="lp-keyword"
                value={draft.keyword}
                onChange={(e) => setDraft((d) => ({ ...d, keyword: e.target.value }))}
                className={filterControlClassName}
                style={filterControlStyle()}
              />
            </FilterField>

            <FilterField label="Proposal Status">
              <MultiSelectChips
                options={STATUSES.map((s) => ({ value: s.value, label: s.label }))}
                selected={draft.statuses}
                onChange={(statuses) => setDraft((d) => ({ ...d, statuses }))}
                emptyLabel="Select All"
              />
            </FilterField>

            <FilterField label="Created Date" htmlFor="lp-created">
              <select
                id="lp-created"
                value={draft.createdDate}
                onChange={(e) => setDraft((d) => ({ ...d, createdDate: e.target.value }))}
                className={filterControlClassName}
                style={filterControlStyle()}
              >
                {DATE_PRESETS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </FilterField>
          </ListFilterSidebar>
        </div>
      </div>
    </div>
  );
}
