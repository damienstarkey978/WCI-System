"use client";

import { useMemo, useState } from "react";

import { LeadActivitiesSubnav, type LeadActivitiesTabKey } from "@/components/leads/sales-subnav";
import { EmptyState } from "@/components/shell/EmptyState";
import { TaskIcon } from "@/components/shell/icons";
import {
  FilterField,
  filterControlClassName,
  filterControlStyle,
  ListFilterSidebar,
} from "@/components/shell/ListFilterSidebar";
import {
  ListToolbar,
  ListToolbarPrimaryButton,
  ListToolbarSecondaryButton,
} from "@/components/shell/ListToolbar";

import { ActivitiesGrid, type ActivityRow } from "./activities-grid";

const ACTIVITY_STATUSES = ["Past Due", "Pending", "Completed", "Logged"] as const;
const LEAD_STAGES = [
  { value: "NEW", label: "New" },
  { value: "CONTACTED", label: "Contacted" },
  { value: "QUALIFIED", label: "Qualified" },
  { value: "PROPOSAL_SENT", label: "Quote Sent" },
  { value: "WON", label: "Won" },
  { value: "LOST", label: "Lost" },
] as const;

const DATE_PRESETS = [
  { value: "all", label: "All dates" },
  { value: "today", label: "Today" },
  { value: "last7", label: "Last 7 days" },
  { value: "last30", label: "Last 30 days" },
  { value: "past", label: "Past due / past dates" },
  { value: "upcoming", label: "Upcoming" },
] as const;

export interface LeadActivitiesClientProps {
  readonly rows: readonly ActivityRow[];
  readonly leadStagesByLeadId: Readonly<Record<string, string>>;
  readonly activityTypeOptions: readonly string[];
  readonly assignedUserOptions: readonly string[];
  readonly activeTab: LeadActivitiesTabKey;
}

interface DraftFilters {
  keyword: string;
  statuses: string[];
  mostRecentClick: string;
  linksClicked: string;
  leadStatuses: string[];
  activityTypes: string[];
  assignedUsers: string[];
  includeAttendees: boolean;
  activityDate: string;
}

const EMPTY_FILTERS: DraftFilters = {
  keyword: "",
  statuses: [],
  mostRecentClick: "all",
  linksClicked: "all",
  leadStatuses: [],
  activityTypes: [],
  assignedUsers: [],
  includeAttendees: true,
  activityDate: "all",
};

function countActiveFilters(f: DraftFilters): number {
  let n = 0;
  if (f.keyword.trim()) n += 1;
  if (f.statuses.length > 0) n += 1;
  if (f.mostRecentClick !== "all") n += 1;
  if (f.linksClicked !== "all") n += 1;
  if (f.leadStatuses.length > 0) n += 1;
  if (f.activityTypes.length > 0) n += 1;
  if (f.assignedUsers.length > 0) n += 1;
  if (f.activityDate !== "all") n += 1;
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
    case "past":
      return t < todayMs;
    case "upcoming":
      return t >= todayMs;
    default:
      return true;
  }
}

function statusFilterLabel(status: ActivityRow["status"]): string {
  switch (status) {
    case "PAST_DUE":
      return "Past Due";
    case "PENDING":
      return "Pending";
    case "COMPLETED":
      return "Completed";
    case "LOGGED":
      return "Logged";
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
      <div
        className="flex min-h-10 flex-wrap gap-1.5 rounded border px-2 py-1.5 sm:min-h-0"
        style={filterControlStyle()}
      >
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

/** Client shell: BT toolbar + Filter sidebar + Activity view grid. */
export function LeadActivitiesClient({
  rows,
  leadStagesByLeadId,
  activityTypeOptions,
  assignedUserOptions,
  activeTab,
}: LeadActivitiesClientProps) {
  const [filterOpen, setFilterOpen] = useState(false);
  const [draft, setDraft] = useState<DraftFilters>(EMPTY_FILTERS);
  const [applied, setApplied] = useState<DraftFilters>(EMPTY_FILTERS);

  const filtered = useMemo(() => {
    const kw = applied.keyword.trim().toLowerCase();
    return rows.filter((row) => {
      if (kw) {
        const hay = `${row.title} ${row.activityNotes} ${row.typeLabel} ${row.assignedUser ?? ""} ${row.email ?? ""} ${row.city ?? ""} ${row.cellPhone ?? ""}`.toLowerCase();
        if (!hay.includes(kw)) return false;
      }
      if (applied.statuses.length > 0 && !applied.statuses.includes(statusFilterLabel(row.status))) return false;
      if (applied.activityTypes.length > 0 && !applied.activityTypes.includes(row.typeLabel)) return false;
      if (applied.assignedUsers.length > 0) {
        const assignee = row.assignedUser ?? "";
        const attendeeHit = applied.includeAttendees && (row.attendees ?? "").split(",").some((a) => applied.assignedUsers.includes(a.trim()));
        if (!applied.assignedUsers.includes(assignee) && !attendeeHit) return false;
      }
      if (applied.leadStatuses.length > 0) {
        const stage = leadStagesByLeadId[row.leadId];
        if (!stage || !applied.leadStatuses.includes(stage)) return false;
      }
      if (!matchesDatePreset(row.contactDate, applied.activityDate)) return false;
      // Most Recent Click / # Links Clicked — no data yet; only "all" matches.
      if (applied.mostRecentClick !== "all") return false;
      if (applied.linksClicked !== "all") return false;
      return true;
    });
  }, [rows, applied, leadStagesByLeadId]);

  const activeCount = countActiveFilters(applied);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col gap-3 p-4 sm:gap-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-semibold text-[var(--bt-text)]">Lead Activities</h1>
          <ListToolbar
            filterOpen={filterOpen}
            filterActiveCount={activeCount}
            onFilterClick={() => setFilterOpen((open) => !open)}
            secondaryAction={<ListToolbarSecondaryButton href="/leads">Log completed activity</ListToolbarSecondaryButton>}
            primaryAction={<ListToolbarPrimaryButton href="/leads">+ Lead Activity</ListToolbarPrimaryButton>}
          />
        </div>

        <LeadActivitiesSubnav active={activeTab} />

        <div className="flex min-h-0 flex-1 flex-col gap-3 lg:flex-row">
          <div className="min-w-0 flex-1">
            {rows.length === 0 ? (
              <EmptyState
                icon={<TaskIcon className="h-10 w-10" />}
                title="No activity yet"
                description="Log a call, email, meeting, note, or follow-up task on a lead — everything shows up here."
              />
            ) : (
              <ActivitiesGrid rows={filtered} />
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
            <FilterField label="Keyword" htmlFor="la-keyword" hint="Searches title, notes, type, assignee, contact">
              <input
                id="la-keyword"
                value={draft.keyword}
                onChange={(e) => setDraft((d) => ({ ...d, keyword: e.target.value }))}
                className={filterControlClassName}
                style={filterControlStyle()}
              />
            </FilterField>

            <FilterField label="Activity Status">
              <MultiSelectChips
                options={ACTIVITY_STATUSES.map((s) => ({ value: s, label: s }))}
                selected={draft.statuses}
                onChange={(statuses) => setDraft((d) => ({ ...d, statuses }))}
              />
            </FilterField>

            <FilterField label="Most Recent Click" htmlFor="la-mrc">
              <select
                id="la-mrc"
                value={draft.mostRecentClick}
                onChange={(e) => setDraft((d) => ({ ...d, mostRecentClick: e.target.value }))}
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

            <FilterField label="# of Links Clicked" htmlFor="la-links">
              <select
                id="la-links"
                value={draft.linksClicked}
                onChange={(e) => setDraft((d) => ({ ...d, linksClicked: e.target.value }))}
                className={filterControlClassName}
                style={filterControlStyle()}
              >
                <option value="all">--ALL--</option>
                <option value="0">0</option>
                <option value="1plus">1+</option>
              </select>
            </FilterField>

            <FilterField label="Lead Status">
              <MultiSelectChips
                options={LEAD_STAGES.map((s) => ({ value: s.value, label: s.label }))}
                selected={draft.leadStatuses}
                onChange={(leadStatuses) => setDraft((d) => ({ ...d, leadStatuses }))}
                emptyLabel="Select All"
              />
            </FilterField>

            <FilterField label="Activity Type">
              <MultiSelectChips
                options={activityTypeOptions.map((t) => ({ value: t, label: t }))}
                selected={draft.activityTypes}
                onChange={(activityTypes) => setDraft((d) => ({ ...d, activityTypes }))}
              />
            </FilterField>

            <FilterField label="Assigned User">
              <MultiSelectChips
                options={assignedUserOptions.map((u) => ({ value: u, label: u }))}
                selected={draft.assignedUsers}
                onChange={(assignedUsers) => setDraft((d) => ({ ...d, assignedUsers }))}
              />
            </FilterField>

            <label className="flex items-start gap-2 text-sm text-[var(--bt-text)]">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={draft.includeAttendees}
                onChange={(e) => setDraft((d) => ({ ...d, includeAttendees: e.target.checked }))}
              />
              <span>Include Attendees in Assigned User Filter</span>
            </label>

            <FilterField label="Activity Date" htmlFor="la-date">
              <select
                id="la-date"
                value={draft.activityDate}
                onChange={(e) => setDraft((d) => ({ ...d, activityDate: e.target.value }))}
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
