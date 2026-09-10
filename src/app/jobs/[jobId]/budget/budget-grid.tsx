"use client";

import { useState } from "react";

export interface GridCell {
  readonly text: string;
  readonly danger?: boolean;
}

export interface GridRow {
  readonly key: string;
  readonly code: string;
  readonly name: string;
  readonly cells: readonly GridCell[];
}

export interface GridGroup {
  readonly key: string;
  readonly code: string;
  readonly name: string;
  readonly rows: readonly GridRow[];
  readonly subtotalCells: readonly GridCell[];
  readonly hasOverBudgetLine: boolean;
}

/**
 * The job costing grid. Groups collapse so a job with 80 cost codes can be read as
 * 19 trades; a collapsed group still shows its subtotal, so collapsing never hides
 * money. Everything arrives pre-formatted from the server — this component decides
 * what is visible, not what anything is worth.
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

      <div
        className="overflow-x-auto rounded-lg border bg-[var(--bt-panel-bg)]"
        style={{ borderColor: "var(--bt-border)" }}
      >
        <table className="w-full min-w-max text-sm">
          <thead>
            <tr
              className="border-b text-xs font-semibold uppercase tracking-wide text-[var(--bt-muted)]"
              style={{ borderColor: "var(--bt-border)" }}
            >
              <th className="sticky left-0 bg-[var(--bt-panel-bg)] px-4 py-3 text-left">Cost code</th>
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
                      style={{ color: cell.danger ? "var(--bt-danger)" : "var(--bt-text)" }}
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
                        </td>
                        {row.cells.map((cell, index) => (
                          <td
                            key={columnLabels[index]}
                            className="whitespace-nowrap px-4 py-2 text-right"
                            style={cell.danger ? { color: "var(--bt-danger)", fontWeight: 600 } : { color: "var(--bt-text)" }}
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
                  <td key={columnLabels[index]} className="whitespace-nowrap px-4 py-3 text-right text-[var(--bt-text)]">
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
