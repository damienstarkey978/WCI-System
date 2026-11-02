"use client";

import { useMemo, useState } from "react";

import {
  FilterField,
  filterControlClassName,
  filterControlStyle,
  ListFilterSidebar,
} from "@/components/shell/ListFilterSidebar";
import { ListToolbar } from "@/components/shell/ListToolbar";
import { countTruthyFilters, MultiSelectChips } from "@/components/shell/list-filter-fields";

import type { PhaseOption, ScheduleItemOption, StaffOption } from "./schedule-item-form";
import { ScheduleListGrid, type ScheduleListRow } from "./schedule-list-grid";

interface DraftFilters {
  keyword: string;
  phases: string[];
  confirmation: string[];
  criticalOnly: boolean;
}

const EMPTY: DraftFilters = { keyword: "", phases: [], confirmation: [], criticalOnly: false };

/** Filter chrome around Schedule List view (BT list filter parity). */
export function ScheduleListClient({
  rows,
  phases,
  showPhases,
  criticalPath,
  jobId,
  scheduleId,
  jobName,
  existingItems,
  staff,
}: {
  rows: readonly ScheduleListRow[];
  phases: readonly PhaseOption[];
  showPhases: boolean;
  criticalPath: boolean;
  jobId: string;
  scheduleId: string;
  jobName: string;
  existingItems: readonly ScheduleItemOption[];
  staff: readonly StaffOption[];
}) {
  const [filterOpen, setFilterOpen] = useState(false);
  const [draft, setDraft] = useState<DraftFilters>(EMPTY);
  const [applied, setApplied] = useState<DraftFilters>(EMPTY);

  const phaseOptions = useMemo(
    () => [
      { value: "__none__", label: "Unassigned" },
      ...phases.map((p) => ({ value: p.id, label: p.name })),
    ],
    [phases],
  );

  const filtered = useMemo(() => {
    const kw = applied.keyword.trim().toLowerCase();
    return rows.filter((row) => {
      if (kw && !row.title.toLowerCase().includes(kw)) return false;
      if (applied.criticalOnly && !row.isCriticalPath) return false;
      if (applied.confirmation.length > 0) {
        const label = row.confirmed ? "Confirmed" : "Unconfirmed";
        if (!applied.confirmation.includes(label)) return false;
      }
      if (applied.phases.length > 0) {
        const key = row.phaseId ?? "__none__";
        if (!applied.phases.includes(key)) return false;
      }
      return true;
    });
  }, [rows, applied]);

  const activeCount = countTruthyFilters([
    Boolean(applied.keyword.trim()),
    applied.phases.length > 0,
    applied.confirmation.length > 0,
    applied.criticalOnly,
  ]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <ListToolbar filterOpen={filterOpen} filterActiveCount={activeCount} onFilterClick={() => setFilterOpen((o) => !o)} />
      </div>
      <div className="flex flex-col gap-3 lg:flex-row">
        <div className="min-w-0 flex-1">
          <ScheduleListGrid
            rows={filtered}
            phases={phases}
            showPhases={showPhases}
            criticalPath={criticalPath}
            jobId={jobId}
            scheduleId={scheduleId}
            jobName={jobName}
            existingItems={existingItems}
            staff={staff}
          />
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
          <FilterField label="Keyword" htmlFor="sch-kw">
            <input
              id="sch-kw"
              value={draft.keyword}
              onChange={(e) => setDraft((d) => ({ ...d, keyword: e.target.value }))}
              className={filterControlClassName}
              style={filterControlStyle()}
            />
          </FilterField>
          <FilterField label="Phase">
            <MultiSelectChips
              options={phaseOptions}
              selected={draft.phases}
              onChange={(phases) => setDraft((d) => ({ ...d, phases }))}
            />
          </FilterField>
          <FilterField label="Confirmation">
            <MultiSelectChips
              options={[
                { value: "Confirmed", label: "Confirmed" },
                { value: "Unconfirmed", label: "Unconfirmed" },
              ]}
              selected={draft.confirmation}
              onChange={(confirmation) => setDraft((d) => ({ ...d, confirmation }))}
            />
          </FilterField>
          <label className="flex items-start gap-2 text-sm text-[var(--bt-text)]">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={draft.criticalOnly}
              onChange={(e) => setDraft((d) => ({ ...d, criticalOnly: e.target.checked }))}
            />
            <span>Critical path items only</span>
          </label>
        </ListFilterSidebar>
      </div>
    </div>
  );
}
