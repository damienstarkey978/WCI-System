"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { EmptyState } from "@/components/shell/EmptyState";
import { ReceiptIcon } from "@/components/shell/icons";
import {
  FilterField,
  filterControlClassName,
  filterControlStyle,
  ListFilterSidebar,
} from "@/components/shell/ListFilterSidebar";
import { ListToolbar } from "@/components/shell/ListToolbar";
import {
  COMMON_DATE_PRESETS,
  countTruthyFilters,
  DatePresetSelect,
  matchesDatePreset,
  MultiSelectChips,
} from "@/components/shell/list-filter-fields";

import { BillsGrid, type BillRow } from "./bills-grid";

const TABS = [
  { key: "INBOX", label: "Inbox" },
  { key: "IN_REVIEW", label: "In Review" },
  { key: "READY_FOR_PAYMENT", label: "Ready for Payment" },
  { key: "PAID", label: "Paid" },
  { key: "ALL", label: "All bills" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

interface DraftFilters {
  keyword: string;
  vendors: string[];
  datePreset: string;
}

const EMPTY: DraftFilters = { keyword: "", vendors: [], datePreset: "all" };

export function BillsListClient({
  jobId,
  activeTab,
  counts,
  rows,
  isQboConnected,
  createBill,
  emptyAction,
}: {
  jobId: string;
  activeTab: TabKey;
  counts: Readonly<Partial<Record<TabKey, number>> & { ALL?: number }>;
  rows: readonly BillRow[];
  isQboConnected: boolean;
  emptyAction: React.ReactNode;
}) {
  const [filterOpen, setFilterOpen] = useState(false);
  const [draft, setDraft] = useState<DraftFilters>(EMPTY);
  const [applied, setApplied] = useState<DraftFilters>(EMPTY);

  const vendorOptions = useMemo(() => {
    const set = new Set<string>();
    for (const row of rows) if (row.vendorName) set.add(row.vendorName);
    return [...set].sort((a, b) => a.localeCompare(b)).map((v) => ({ value: v, label: v }));
  }, [rows]);

  const filtered = useMemo(() => {
    const kw = applied.keyword.trim().toLowerCase();
    return rows.filter((row) => {
      if (kw) {
        const hay = `${row.title ?? ""} ${row.billNumber ?? ""} ${row.vendorName} ${row.poNumber ?? ""} ${row.createdByName ?? ""}`.toLowerCase();
        if (!hay.includes(kw)) return false;
      }
      if (applied.vendors.length > 0 && !applied.vendors.includes(row.vendorName)) return false;
      if (!matchesDatePreset(row.dateLabel, applied.datePreset)) return false;
      return true;
    });
  }, [rows, applied]);

  const activeCount = countTruthyFilters([
    Boolean(applied.keyword.trim()),
    applied.vendors.length > 0,
    applied.datePreset !== "all",
  ]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <nav className="flex flex-wrap gap-1 border-b" style={{ borderColor: "var(--bt-border)" }}>
          {TABS.map((tab) => {
            const isActive = tab.key === activeTab;
            return (
              <Link
                key={tab.key}
                href={`/jobs/${jobId}/bills?status=${tab.key}`}
                className="-mb-px border-b-2 px-3 py-2 text-sm font-medium transition"
                style={{
                  borderColor: isActive ? "var(--bt-primary)" : "transparent",
                  color: isActive ? "var(--bt-primary)" : "var(--bt-muted)",
                }}
              >
                {tab.label}
                <span className="ml-1.5 rounded bg-black/5 px-1.5 py-0.5 text-[10px] font-semibold">{counts[tab.key] ?? 0}</span>
              </Link>
            );
          })}
        </nav>
        <ListToolbar filterOpen={filterOpen} filterActiveCount={activeCount} onFilterClick={() => setFilterOpen((o) => !o)} />
      </div>

      <div className="flex flex-col gap-3 lg:flex-row">
        <div className="min-w-0 flex-1">
          {rows.length === 0 ? (
            <EmptyState
              icon={<ReceiptIcon className="h-10 w-10" />}
              title={
                activeTab === "INBOX"
                  ? "You're all caught up"
                  : activeTab === "ALL"
                    ? "No bills yet"
                    : `Nothing in ${TABS.find((t) => t.key === activeTab)?.label}`
              }
              description="Drop a receipt above, forward one to the inbox address, or add a bill by hand."
              action={emptyAction}
            />
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={<ReceiptIcon className="h-10 w-10" />}
              title="No bills match"
              description="Clear filters or adjust Keyword / Pay to / Invoice date."
            />
          ) : (
            <BillsGrid rows={filtered} isQboConnected={isQboConnected} />
          )}
        </div>

        <ListFilterSidebar
          open={filterOpen}
          onClose={() => setFilterOpen(false)}
          onClearAll={() => {
            setDraft(EMPTY);
            setApplied(EMPTY);
          }}
          onApply={() => {
            setApplied(draft);
            setFilterOpen(false);
          }}
        >
          <FilterField label="Keyword" htmlFor="bills-kw" hint="Title, bill #, vendor, PO, created by">
            <input
              id="bills-kw"
              value={draft.keyword}
              onChange={(e) => setDraft((d) => ({ ...d, keyword: e.target.value }))}
              className={filterControlClassName}
              style={filterControlStyle()}
            />
          </FilterField>
          <FilterField label="Pay to">
            <MultiSelectChips
              options={vendorOptions}
              selected={draft.vendors}
              onChange={(vendors) => setDraft((d) => ({ ...d, vendors }))}
            />
          </FilterField>
          <FilterField label="Invoice date" htmlFor="bills-date">
            <DatePresetSelect
              id="bills-date"
              value={draft.datePreset}
              onChange={(datePreset) => setDraft((d) => ({ ...d, datePreset }))}
              options={COMMON_DATE_PRESETS}
            />
          </FilterField>
          <div className="pt-2 text-xs text-[var(--bt-muted)]">Pipeline tabs above still scope the list; Filter narrows within the tab.</div>
        </ListFilterSidebar>
      </div>
    </div>
  );
}
