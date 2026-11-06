"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";

import { EmptyState } from "@/components/shell/EmptyState";
import { DocumentIcon } from "@/components/shell/icons";
import {
  FilterField,
  filterControlClassName,
  filterControlStyle,
  ListFilterSidebar,
} from "@/components/shell/ListFilterSidebar";
import {
  COMMON_DATE_PRESETS,
  countTruthyFilters,
  DatePresetSelect,
  matchesDatePreset,
  MultiSelectChips,
} from "@/components/shell/list-filter-fields";
import { FinancialPageHeader } from "../financial-tabs";

import { InvoicesToolbar, type InvoiceCreateBranding } from "./invoices-toolbar";

export type InvoiceListRow = {
  readonly id: string;
  readonly invoiceNumber: string;
  readonly displayId: string;
  readonly title: string | null;
  readonly displayStatus: string;
  readonly termsLabel: string | null;
  readonly totalLabel: string;
  readonly paidLabel: string;
  readonly balanceLabel: string;
  readonly balanceCents: number;
  readonly datePaidLabel: string;
  readonly datePaidIso: string | null;
  readonly lateDays: number | null;
  readonly searchText: string;
};

type DraftFilters = {
  keyword: string;
  statuses: string[];
  datePreset: string;
};

const EMPTY: DraftFilters = { keyword: "", statuses: [], datePreset: "all" };

const STATUS_OPTIONS = [
  { value: "DRAFT", label: "Draft" },
  { value: "SENT", label: "Pending/Sent" },
  { value: "PARTIALLY_PAID", label: "Partially paid" },
  { value: "PAID", label: "Paid" },
  { value: "VOID", label: "Void" },
];

function Badge({ status }: { status: string }) {
  const style =
    status === "PAID"
      ? { bg: "#e6f4ea", text: "#1e7e34" }
      : status === "DRAFT"
        ? { bg: "#e5e7eb", text: "#374151" }
        : status === "VOID"
          ? { bg: "color-mix(in srgb, var(--bt-danger) 14%, transparent)", text: "var(--bt-danger)" }
          : { bg: "#fff4e5", text: "#b76e00" };
  const label =
    status === "PAID"
      ? "Paid"
      : status === "DRAFT"
        ? "Draft"
        : status === "VOID"
          ? "Void"
          : status === "PARTIALLY_PAID"
            ? "Partially paid"
            : "Pending/Sent";
  return (
    <span
      className="inline-flex rounded px-1.5 py-0.5 text-[11px] font-semibold"
      style={{ background: style.bg, color: style.text }}
    >
      {label}
    </span>
  );
}

/**
 * Invoices tab chrome: working Help/Share/Filter toolbar, full Create modal, and
 * a real filter drawer that filters the list (no decorative controls).
 */
export function InvoicesListClient({
  jobId,
  jobName,
  scheduleActive,
  branding,
  rows,
  totals,
  voidedNotice,
  emptyTitle,
  emptyDescription,
  tabs,
  contractEquation,
  otherTabContent,
  activeIsInvoices,
  showEquation,
}: {
  jobId: string;
  jobName: string;
  scheduleActive: boolean;
  branding: InvoiceCreateBranding;
  rows: readonly InvoiceListRow[];
  totals: { totalLabel: string; paidLabel: string; balanceLabel: string };
  voidedNotice: ReactNode;
  emptyTitle: string;
  emptyDescription: string;
  tabs: ReactNode;
  contractEquation: ReactNode;
  otherTabContent: ReactNode;
  activeIsInvoices: boolean;
  showEquation: boolean;
}) {
  const [filterOpen, setFilterOpen] = useState(false);
  const [draft, setDraft] = useState<DraftFilters>(EMPTY);
  const [applied, setApplied] = useState<DraftFilters>(EMPTY);

  const filtered = useMemo(() => {
    const kw = applied.keyword.trim().toLowerCase();
    return rows.filter((row) => {
      if (kw && !row.searchText.includes(kw)) return false;
      if (applied.statuses.length > 0 && !applied.statuses.includes(row.displayStatus)) return false;
                  if (applied.datePreset !== "all") {
        if (!row.datePaidIso || !matchesDatePreset(row.datePaidIso, applied.datePreset)) return false;
      }
      return true;
    });
  }, [rows, applied]);

  const activeCount = countTruthyFilters([
    Boolean(applied.keyword.trim()),
    applied.statuses.length > 0,
    applied.datePreset !== "all",
  ]);

  const filteredTotals = useMemo(() => {
    if (activeCount === 0) return totals;
    const balance = filtered.reduce((sum, row) => sum + row.balanceCents, 0);
    return {
      totalLabel: totals.totalLabel,
      paidLabel: totals.paidLabel,
      balanceLabel: new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(balance / 100),
    };
  }, [filtered, activeCount, totals]);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-3 p-4 sm:gap-4 sm:p-6">
      <FinancialPageHeader
        jobName={jobName}
        title="Invoices"
        action={
          <InvoicesToolbar
            jobId={jobId}
            jobName={jobName}
            scheduleActive={scheduleActive}
            filterOpen={filterOpen}
            filterActiveCount={activeCount}
            onFilterClick={() => setFilterOpen((open) => !open)}
            branding={branding}
          />
        }
      />

      {tabs}

      {showEquation ? contractEquation : null}

      {activeIsInvoices ? (
        <>
          <div className="flex flex-col gap-3 lg:flex-row">
            <div className="min-w-0 flex-1 flex flex-col gap-3">
              {voidedNotice}
              {rows.length === 0 ? (
                <EmptyState
                  icon={<DocumentIcon className="h-10 w-10" />}
                  title={emptyTitle}
                  description={emptyDescription}
                />
              ) : filtered.length === 0 ? (
                <EmptyState
                  icon={<DocumentIcon className="h-10 w-10" />}
                  title="No invoices match"
                  description="Clear filters or adjust keyword / status / date paid."
                />
              ) : (
                <div
                  className="overflow-x-auto rounded border bg-[var(--bt-panel-bg)]"
                  style={{ borderColor: "var(--bt-border)" }}
                >
                  <table className="w-full min-w-max text-left text-sm">
                    <thead>
                      <tr
                        className="border-b text-[10px] font-semibold uppercase tracking-wide text-[var(--bt-muted)]"
                        style={{ borderColor: "var(--bt-border)", background: "var(--bt-panel-bg-muted)" }}
                      >
                        {["\u00a0", "Job", "Invoice ID", "Title", "Status", "~Total price", "~Amount paid", "~Balance due", "Date paid"].map(
                          (col) => (
                            <th key={col} className="whitespace-nowrap px-3 py-2 sm:px-4">
                              {col}
                            </th>
                          ),
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((invoice) => (
                        <tr
                          key={invoice.id}
                          className="border-b align-middle last:border-0 hover:bg-black/[0.02]"
                          style={{ borderColor: "var(--bt-border)" }}
                        >
                          <td className="w-8 px-2 py-2.5 sm:px-3">
                            <input
                              type="checkbox"
                              aria-label={`Select invoice ${invoice.displayId}`}
                              className="h-3.5 w-3.5 rounded border"
                              style={{ borderColor: "var(--bt-border)" }}
                            />
                          </td>
                          <td className="max-w-[10rem] truncate px-3 py-2.5 text-[var(--bt-muted)] sm:px-4">{jobName}</td>
                          <td className="px-3 py-2.5 font-medium sm:px-4">
                            <Link
                              href={`/jobs/${jobId}/invoices/${invoice.id}`}
                              className="text-[var(--bt-primary)] hover:underline"
                            >
                              {invoice.displayId}
                            </Link>
                            {invoice.termsLabel ? (
                              <div className="mt-0.5 text-[10px] text-[var(--bt-muted)]">{invoice.termsLabel}</div>
                            ) : null}
                          </td>
                          <td className="px-3 py-2.5 sm:px-4">
                            <Link
                              href={`/jobs/${jobId}/invoices/${invoice.id}`}
                              className="text-[var(--bt-primary)] hover:underline"
                            >
                              {invoice.title ?? "—"}
                            </Link>
                          </td>
                          <td className="px-3 py-2.5 sm:px-4">
                            <Badge status={invoice.displayStatus} />
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-[var(--bt-text)] sm:px-4">
                            {invoice.totalLabel}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-[var(--bt-text)] sm:px-4">
                            {invoice.paidLabel}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-[var(--bt-text)] sm:px-4">
                            {invoice.balanceLabel}
                            {invoice.lateDays ? (
                              <div className="text-[10px] font-semibold" style={{ color: "var(--bt-danger)" }}>
                                {invoice.lateDays}d late
                              </div>
                            ) : null}
                          </td>
                          <td className="px-3 py-2.5 tabular-nums text-[var(--bt-muted)] sm:px-4">
                            {invoice.datePaidLabel}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr
                        className="border-t font-semibold"
                        style={{ borderColor: "var(--bt-border)", background: "var(--bt-panel-bg-muted)" }}
                      >
                        <td className="px-3 py-2.5 sm:px-4" colSpan={5}>
                          {activeCount > 0 ? "Filtered totals" : "Totals"}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums sm:px-4">
                          {activeCount > 0 ? "—" : filteredTotals.totalLabel}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums sm:px-4">
                          {activeCount > 0 ? "—" : filteredTotals.paidLabel}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums sm:px-4">{filteredTotals.balanceLabel}</td>
                        <td className="px-3 py-2.5 sm:px-4" />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--bt-muted)]">
                <span>Standard View</span>
                <span>
                  {filtered.length === 0 ? "0 items" : `1-${filtered.length} of ${filtered.length} items`}
                  {activeCount > 0 ? ` (filtered from ${rows.length})` : null}
                </span>
              </div>
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
              <FilterField label="Keyword" htmlFor="inv-kw" hint="ID, title, status">
                <input
                  id="inv-kw"
                  value={draft.keyword}
                  onChange={(e) => setDraft((d) => ({ ...d, keyword: e.target.value }))}
                  className={filterControlClassName}
                  style={filterControlStyle()}
                  placeholder="Search invoices"
                />
              </FilterField>
              <FilterField label="Status">
                <MultiSelectChips
                  options={STATUS_OPTIONS}
                  selected={draft.statuses}
                  onChange={(statuses) => setDraft((d) => ({ ...d, statuses }))}
                />
              </FilterField>
              <FilterField label="Date paid">
                <DatePresetSelect
                  id="inv-date-paid"
                  value={draft.datePreset}
                  options={COMMON_DATE_PRESETS}
                  onChange={(datePreset) => setDraft((d) => ({ ...d, datePreset }))}
                />
              </FilterField>
            </ListFilterSidebar>
          </div>
        </>
      ) : (
        otherTabContent
      )}
    </div>
  );
}
