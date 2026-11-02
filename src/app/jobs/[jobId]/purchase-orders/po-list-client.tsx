"use client";

import { useMemo, useState } from "react";

import { EmptyState } from "@/components/shell/EmptyState";
import { PurchaseOrderIcon } from "@/components/shell/icons";
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

import { PurchaseOrdersGrid, type PurchaseOrderRow } from "./purchase-orders-grid";

const PO_STATUSES = [
  { value: "DRAFT", label: "Draft" },
  { value: "PENDING_APPROVAL", label: "Pending approval" },
  { value: "APPROVED", label: "Approved" },
  { value: "DECLINED", label: "Declined" },
  { value: "COMPLETED", label: "Completed" },
  { value: "CANCELLED", label: "Cancelled" },
] as const;

interface DraftFilters {
  keyword: string;
  statuses: string[];
  vendors: string[];
  datePreset: string;
}

const EMPTY: DraftFilters = { keyword: "", statuses: [], vendors: [], datePreset: "all" };

export function PurchaseOrdersListClient({
  rows,
  createAction,
}: {
  rows: readonly PurchaseOrderRow[];
  createAction: React.ReactNode;
}) {
  const [filterOpen, setFilterOpen] = useState(false);
  const [draft, setDraft] = useState<DraftFilters>(EMPTY);
  const [applied, setApplied] = useState<DraftFilters>(EMPTY);

  const vendorOptions = useMemo(() => {
    const set = new Set<string>();
    for (const row of rows) if (row.vendorName) set.add(row.vendorName);
    return [...set].sort((a, b) => a.localeCompare(b)).map((v) => ({ value: v, label: v }));
  }, [rows]);

  const statusOptions = useMemo(() => {
    const present = new Set(rows.map((r) => r.status));
    const known = PO_STATUSES.filter((s) => present.has(s.value));
    const extras = [...present]
      .filter((s) => !PO_STATUSES.some((k) => k.value === s))
      .map((s) => ({ value: s, label: s.replace(/_/g, " ") }));
    return [...known, ...extras];
  }, [rows]);

  const filtered = useMemo(() => {
    const kw = applied.keyword.trim().toLowerCase();
    return rows.filter((row) => {
      if (kw) {
        const hay = `${row.poNumber} ${row.poSuffix ?? ""} ${row.title ?? ""} ${row.vendorName}`.toLowerCase();
        if (!hay.includes(kw)) return false;
      }
      if (applied.statuses.length > 0 && !applied.statuses.includes(row.status)) return false;
      if (applied.vendors.length > 0 && !applied.vendors.includes(row.vendorName)) return false;
      if (!matchesDatePreset(row.createdAt, applied.datePreset)) return false;
      return true;
    });
  }, [rows, applied]);

  const activeCount = countTruthyFilters([
    Boolean(applied.keyword.trim()),
    applied.statuses.length > 0,
    applied.vendors.length > 0,
    applied.datePreset !== "all",
  ]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <ListToolbar filterOpen={filterOpen} filterActiveCount={activeCount} onFilterClick={() => setFilterOpen((o) => !o)} />
      </div>

      <div className="flex flex-col gap-3 lg:flex-row">
        <div className="min-w-0 flex-1">
          {rows.length === 0 ? (
            <EmptyState
              icon={<PurchaseOrderIcon className="h-10 w-10" />}
              title="No purchase orders yet"
              description="Create a purchase order for materials or subcontract work on this job."
              action={createAction}
            />
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={<PurchaseOrderIcon className="h-10 w-10" />}
              title="No purchase orders match"
              description="Clear filters or adjust Keyword / PO status / vendor / created date."
            />
          ) : (
            <PurchaseOrdersGrid rows={filtered} />
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
          <FilterField label="Keyword" htmlFor="po-kw" hint="PO #, title, vendor">
            <input
              id="po-kw"
              value={draft.keyword}
              onChange={(e) => setDraft((d) => ({ ...d, keyword: e.target.value }))}
              className={filterControlClassName}
              style={filterControlStyle()}
            />
          </FilterField>
          <FilterField label="PO status">
            <MultiSelectChips
              options={statusOptions}
              selected={draft.statuses}
              onChange={(statuses) => setDraft((d) => ({ ...d, statuses }))}
            />
          </FilterField>
          <FilterField label="Performed by">
            <MultiSelectChips
              options={vendorOptions}
              selected={draft.vendors}
              onChange={(vendors) => setDraft((d) => ({ ...d, vendors }))}
            />
          </FilterField>
          <FilterField label="Created date" htmlFor="po-date">
            <DatePresetSelect
              id="po-date"
              value={draft.datePreset}
              onChange={(datePreset) => setDraft((d) => ({ ...d, datePreset }))}
              options={COMMON_DATE_PRESETS}
            />
          </FilterField>
        </ListFilterSidebar>
      </div>
    </div>
  );
}
