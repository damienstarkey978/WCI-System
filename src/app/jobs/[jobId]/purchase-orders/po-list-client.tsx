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

import type { ScheduleOption, VendorOption } from "./create-po-form";
import { PurchaseOrderDetailModal } from "./po-detail-modal";
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
  /** When false (BT default), CANCELLED / recalled twins stay out of the grid. */
  includeCancelled: boolean;
}

const EMPTY: DraftFilters = {
  keyword: "",
  statuses: [],
  vendors: [],
  datePreset: "all",
  includeCancelled: false,
};

export function PurchaseOrdersListClient({
  rows,
  vendors,
  scheduleItems,
  createAction,
}: {
  rows: readonly PurchaseOrderRow[];
  vendors: readonly VendorOption[];
  scheduleItems: readonly ScheduleOption[];
  createAction: React.ReactNode;
}) {
  const [filterOpen, setFilterOpen] = useState(false);
  const [draft, setDraft] = useState<DraftFilters>(EMPTY);
  const [applied, setApplied] = useState<DraftFilters>(EMPTY);
  const [editing, setEditing] = useState<PurchaseOrderRow | null>(null);

  const vendorOptions = useMemo(() => {
    const set = new Set<string>();
    for (const row of rows) {
      const name = row.vendorName?.trim();
      if (name && name !== "Unassigned" && name !== "Unknown vendor") set.add(name);
    }
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
      if (!applied.includeCancelled && row.status === "CANCELLED") return false;
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
    applied.includeCancelled,
  ]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <ListToolbar
          filterOpen={filterOpen}
          filterActiveCount={activeCount}
          onFilterClick={() => setFilterOpen((o) => !o)}
        />
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
              description="Clear filters or include Cancelled / adjust Keyword / PO status / vendor / created date."
            />
          ) : (
            <PurchaseOrdersGrid rows={filtered} onEdit={setEditing} />
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
          <label className="flex items-center gap-2 pt-1 text-sm text-[var(--bt-text)]">
            <input
              type="checkbox"
              checked={draft.includeCancelled}
              onChange={(e) => setDraft((d) => ({ ...d, includeCancelled: e.target.checked }))}
              className="rounded border"
              style={{ borderColor: "var(--bt-border)" }}
            />
            Include cancelled
          </label>
          <div className="pt-1 text-xs text-[var(--bt-muted)]">
            Cancelled import twins are hidden by default so the list matches Buildertrend&apos;s active set.
          </div>
        </ListFilterSidebar>
      </div>

      {editing ? (
        <PurchaseOrderDetailModal
          row={editing}
          vendors={vendors}
          scheduleItems={scheduleItems}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </div>
  );
}
