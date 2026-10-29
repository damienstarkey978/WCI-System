"use client";

import { useState } from "react";

import { COST_TYPE_LABELS, type BudgetCostType } from "@/lib/budget/cost-types";

export interface GridCell {
  readonly text: string;
  readonly danger?: boolean;
  /** Soft warning (e.g. variance still positive but trending). */
  readonly warn?: boolean;
}

export interface GridRow {
  readonly key: string;
  readonly code: string;
  readonly name: string;
  readonly cells: readonly GridCell[];
  /** Spend against a cost code nobody budgeted for. */
  readonly unbudgeted?: boolean;
  /** LABOR / MATERIAL / … badge from the cost-code catalog. */
  readonly costType?: BudgetCostType;
  /** True when projected cost has passed revised budget. */
  readonly overBudget?: boolean;
  /** Percent of revised budget already spent, when budgeted. */
  readonly spendPercent?: number | null;
}

export interface GridGroup {
  readonly key: string;
  readonly code: string;
  readonly name: string;
  readonly rows: readonly GridRow[];
  readonly subtotalCells: readonly GridCell[];
  readonly hasOverBudgetLine: boolean;
}

function CostTypeBadge({ costType }: { costType: BudgetCostType }) {
  if (costType === "NONE") return null;
  const label = COST_TYPE_LABELS[costType];
  const tone =
    costType === "LABOR"
      ? "var(--bt-primary)"
      : costType === "MATERIAL"
        ? "var(--bt-hazard)"
        : "var(--bt-muted)";
  return (
    <span
      className="ml-1.5 rounded px-1 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
      style={{ background: `color-mix(in srgb, ${tone} 14%, transparent)`, color: tone }}
    >
      {label}
    </span>
  );
}

function StatusBadge({ row }: { row: GridRow }) {
  if (row.unbudgeted) {
    return (
      <span
        className="ml-1.5 rounded px-1 py-0.5 text-[10px] font-semibold"
        style={{ background: "color-mix(in srgb, var(--bt-hazard) 14%, transparent)", color: "var(--bt-hazard)" }}
        title="Costs have been booked against this code, but it was never budgeted."
      >
        No budget
      </span>
    );
  }
  if (row.overBudget) {
    return (
      <span
        className="ml-1.5 rounded px-1 py-0.5 text-[10px] font-semibold"
        style={{ background: "color-mix(in srgb, var(--bt-danger) 14%, transparent)", color: "var(--bt-danger)" }}
      >
        Over
      </span>
    );
  }
  if (row.spendPercent != null && row.spendPercent >= 90) {
    return (
      <span
        className="ml-1.5 rounded px-1 py-0.5 text-[10px] font-semibold"
        style={{ background: "color-mix(in srgb, var(--bt-hazard) 14%, transparent)", color: "var(--bt-hazard)" }}
      >
        {row.spendPercent}% spent
      </span>
    );
  }
  if (row.spendPercent != null && row.spendPercent > 0) {
    return (
      <span className="ml-1.5 text-[10px] font-medium text-[var(--bt-muted)]">{row.spendPercent}% spent</span>
    );
  }
  return null;
}

/**
 * The job costing grid. Groups collapse so a job with 80 cost codes can be read as
 * 19 trades; a collapsed group still shows its subtotal, so collapsing never hides
 * money. Everything arrives pre-formatted from the server — this component decides
 * what is visible, not what anything is worth.
 *
 * Desktop: sticky first column table (Buildertrend shape). Mobile: stacked cards
 * per line so staff can still read Labor vs Materials and Actuals without
 * horizontal-scrolling a 8-column grid.
 */
export function BudgetGrid({
  columnLabels,
  groups,
  totalCells,
}: {
  columnLabels: readonly string[];
  groups: readonly GridGroup[];
  totalCells: readonly GridCell[];
}) {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());

  const toggle = (key: string) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (!next.delete(key)) next.add(key);
      return next;
    });

  const allCollapsed = collapsed.size === groups.length && groups.length > 0;

  return (
    <div className="flex flex-col gap-2">
      {groups.length > 1 ? (
        <button
          type="button"
          onClick={() => setCollapsed(allCollapsed ? new Set() : new Set(groups.map((group) => group.key)))}
          className="self-start text-xs font-medium hover:underline"
          style={{ color: "var(--bt-primary)" }}
        >
          {allCollapsed ? "Expand all" : "Collapse all"}
        </button>
      ) : null}

      {/* Mobile cards — shown below md. */}
      <div className="flex flex-col gap-3 md:hidden">
        {groups.map((group) => {
          const isCollapsed = collapsed.has(group.key);
          return (
            <section
              key={group.key}
              className="overflow-hidden rounded-lg border bg-[var(--bt-panel-bg)]"
              style={{ borderColor: "var(--bt-border)" }}
            >
              <button
                type="button"
                onClick={() => toggle(group.key)}
                aria-expanded={!isCollapsed}
                className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left"
                style={{ background: "color-mix(in srgb, var(--bt-primary) 6%, transparent)" }}
              >
                <span className="font-semibold text-[var(--bt-text)]">
                  {group.code ? <span className="mr-1 font-mono text-xs text-[var(--bt-muted)]">{group.code}</span> : null}
                  {group.name}
                  <span className="ml-1 text-xs font-normal text-[var(--bt-muted)]">({group.rows.length})</span>
                  {group.hasOverBudgetLine ? (
                    <span
                      className="ml-1.5 rounded px-1 py-0.5 text-[10px] font-semibold"
                      style={{ background: "color-mix(in srgb, var(--bt-danger) 14%, transparent)", color: "var(--bt-danger)" }}
                    >
                      Over
                    </span>
                  ) : null}
                </span>
                <span aria-hidden className="text-[var(--bt-muted)]">
                  {isCollapsed ? "▸" : "▾"}
                </span>
              </button>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 border-b px-3 py-2 text-xs" style={{ borderColor: "var(--bt-border)" }}>
                {columnLabels.map((label, index) => (
                  <div key={`g-${group.key}-${label}`} className="flex justify-between gap-2">
                    <span className="text-[var(--bt-muted)]">{label}</span>
                    <span
                      className="font-semibold"
                      style={{ color: group.subtotalCells[index]?.danger ? "var(--bt-danger)" : "var(--bt-text)" }}
                    >
                      {group.subtotalCells[index]?.text}
                    </span>
                  </div>
                ))}
              </div>
              {isCollapsed
                ? null
                : group.rows.map((row) => (
                    <article key={row.key} className="border-b px-3 py-2.5 last:border-b-0" style={{ borderColor: "var(--bt-border)" }}>
                      <div className="mb-1.5 flex flex-wrap items-center gap-y-1 text-sm">
                        <span className="font-mono text-xs text-[var(--bt-muted)]">{row.code}</span>
                        <span className="ml-1.5 font-medium text-[var(--bt-text)]">{row.name}</span>
                        {row.costType ? <CostTypeBadge costType={row.costType} /> : null}
                        <StatusBadge row={row} />
                      </div>
                      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                        {columnLabels.map((label, index) => (
                          <div key={`${row.key}-${label}`} className="flex justify-between gap-2">
                            <span className="text-[var(--bt-muted)]">{label}</span>
                            <span
                              style={{
                                color: row.cells[index]?.danger
                                  ? "var(--bt-danger)"
                                  : row.cells[index]?.warn
                                    ? "var(--bt-hazard)"
                                    : "var(--bt-text)",
                                fontWeight: row.cells[index]?.danger ? 600 : 400,
                              }}
                            >
                              {row.cells[index]?.text}
                            </span>
                          </div>
                        ))}
                      </div>
                    </article>
                  ))}
            </section>
          );
        })}
        {groups.length > 0 ? (
          <div
            className="rounded-lg border bg-[var(--bt-panel-bg)] px-3 py-2.5"
            style={{ borderColor: "var(--bt-border)" }}
          >
            <div className="mb-1.5 text-sm font-semibold text-[var(--bt-text)]">Total</div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
              {columnLabels.map((label, index) => (
                <div key={`total-${label}`} className="flex justify-between gap-2">
                  <span className="text-[var(--bt-muted)]">{label}</span>
                  <span className="font-semibold text-[var(--bt-text)]">{totalCells[index]?.text}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      {/* Desktop table — Buildertrend shape. */}
      <div
        className="hidden overflow-x-auto rounded-lg border bg-[var(--bt-panel-bg)] md:block"
        style={{ borderColor: "var(--bt-border)" }}
      >
        <table className="w-full min-w-max text-sm">
          <thead>
            <tr
              className="border-b text-xs font-semibold uppercase tracking-wide text-[var(--bt-muted)]"
              style={{ borderColor: "var(--bt-border)" }}
            >
              <th className="sticky left-0 bg-[var(--bt-panel-bg)] px-4 py-3 text-left">Cost categories</th>
              {columnLabels.map((label) => (
                <th key={label} className="whitespace-nowrap px-4 py-3 text-right">
                  {label}
                </th>
              ))}
            </tr>
          </thead>

          {groups.map((group) => {
            const isCollapsed = collapsed.has(group.key);
            return (
              <tbody key={group.key}>
                <tr className="border-b" style={{ borderColor: "var(--bt-border)", background: "color-mix(in srgb, var(--bt-primary) 6%, transparent)" }}>
                  <td className="sticky left-0 whitespace-nowrap px-4 py-2 font-semibold" style={{ background: "color-mix(in srgb, var(--bt-primary) 6%, var(--bt-panel-bg))" }}>
                    <button
                      type="button"
                      onClick={() => toggle(group.key)}
                      aria-expanded={!isCollapsed}
                      className="flex items-center gap-1.5 text-left text-[var(--bt-text)]"
                    >
                      <span aria-hidden className="inline-block w-3 text-[var(--bt-muted)]">
                        {isCollapsed ? "▸" : "▾"}
                      </span>
                      {group.code ? <span className="font-mono text-xs text-[var(--bt-muted)]">{group.code}</span> : null}
                      <span>{group.name}</span>
                      <span className="text-xs font-normal text-[var(--bt-muted)]">
                        ({group.rows.length})
                      </span>
                      {group.hasOverBudgetLine ? (
                        <span
                          className="rounded px-1 py-0.5 text-[10px] font-semibold"
                          style={{ background: "color-mix(in srgb, var(--bt-danger) 14%, transparent)", color: "var(--bt-danger)" }}
                        >
                          Over
                        </span>
                      ) : null}
                    </button>
                  </td>
                  {group.subtotalCells.map((cell, index) => (
                    <td
                      key={columnLabels[index]}
                      className="whitespace-nowrap px-4 py-2 text-right font-semibold"
                      style={{ color: cell.danger ? "var(--bt-danger)" : cell.warn ? "var(--bt-hazard)" : "var(--bt-text)" }}
                    >
                      {cell.text}
                    </td>
                  ))}
                </tr>

                {isCollapsed
                  ? null
                  : group.rows.map((row) => (
                      <tr key={row.key} className="border-b" style={{ borderColor: "var(--bt-border)" }}>
                        <td className="sticky left-0 whitespace-nowrap bg-[var(--bt-panel-bg)] px-4 py-2 pl-9">
                          <span className="font-mono text-xs text-[var(--bt-muted)]">{row.code}</span>{" "}
                          <span className="text-[var(--bt-text)]">{row.name}</span>
                          {row.costType ? <CostTypeBadge costType={row.costType} /> : null}
                          <StatusBadge row={row} />
                        </td>
                        {row.cells.map((cell, index) => (
                          <td
                            key={columnLabels[index]}
                            className="whitespace-nowrap px-4 py-2 text-right"
                            style={
                              cell.danger
                                ? { color: "var(--bt-danger)", fontWeight: 600 }
                                : cell.warn
                                  ? { color: "var(--bt-hazard)", fontWeight: 600 }
                                  : { color: "var(--bt-text)" }
                            }
                          >
                            {cell.text}
                          </td>
                        ))}
                      </tr>
                    ))}
              </tbody>
            );
          })}

          {groups.length === 0 ? (
            <tbody>
              <tr>
                <td colSpan={columnLabels.length + 1} className="px-4 py-6 text-center text-[var(--bt-muted)]">
                  No budget lines yet.
                </td>
              </tr>
            </tbody>
          ) : (
            <tfoot>
              <tr className="border-t-2 font-semibold" style={{ borderColor: "var(--bt-border)" }}>
                <td className="sticky left-0 bg-[var(--bt-panel-bg)] px-4 py-3 text-[var(--bt-text)]">Total</td>
                {totalCells.map((cell, index) => (
                  <td
                    key={columnLabels[index]}
                    className="whitespace-nowrap px-4 py-3 text-right"
                    style={{ color: cell.danger ? "var(--bt-danger)" : "var(--bt-text)" }}
                  >
                    {cell.text}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
