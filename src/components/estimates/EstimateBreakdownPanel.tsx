/**
 * Handoff-style Breakdown drawer: Material / Labor / Other cost + markup,
 * below-the-line / discount Add slots, estimate total, profit margin.
 */

"use client";

import { computeEstimateBreakdown, type BreakdownLineInput } from "@/lib/estimates/breakdown";
import { formatMoney, formatPercent } from "@/lib/format";

function BucketCostRow({ label, cents }: { readonly label: string; readonly cents: number }) {
  return (
    <div className="flex items-baseline justify-between gap-3 pl-3 text-[12px] text-[var(--bt-muted)]">
      <span>{label}</span>
      <span className="tabular-nums text-[var(--bt-text)]">{formatMoney(cents)}</span>
    </div>
  );
}

function BucketMarkupRow({
  label,
  markupBasisPoints,
  markupCents,
}: {
  readonly label: string;
  readonly markupBasisPoints: number;
  readonly markupCents: number;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 pl-3 text-[12px] text-[var(--bt-muted)]">
      <span className="flex min-w-0 items-center gap-2">
        <span className="truncate">{label}</span>
        <span
          className="shrink-0 rounded-full px-1.5 py-px text-[10px] font-semibold tabular-nums text-[var(--bt-muted)]"
          style={{ background: "var(--bt-panel-bg-muted)" }}
        >
          {formatPercent(markupBasisPoints)}
        </span>
      </span>
      <span className="tabular-nums text-[var(--bt-text)]">{formatMoney(markupCents)}</span>
    </div>
  );
}

export function EstimateBreakdownPanel({
  lines,
  open,
  onClose,
}: {
  readonly lines: readonly BreakdownLineInput[];
  readonly open: boolean;
  readonly onClose: () => void;
}) {
  if (!open) return null;

  const breakdown = computeEstimateBreakdown(lines);

  return (
    <aside
      id="estimate-breakdown-panel"
      className="mt-1.5 flex w-full max-w-none shrink-0 flex-col rounded-md border bg-[var(--bt-panel-bg)] shadow-lg lg:mt-0 lg:max-w-[20rem] lg:rounded-none lg:rounded-r-md lg:border-l lg:border-y-0 lg:border-r-0"
      style={{ borderColor: "var(--bt-border)" }}
      aria-label="Estimate breakdown"
    >
      <div
        className="flex items-center justify-between border-b px-3 py-2.5"
        style={{ borderColor: "var(--bt-border)" }}
      >
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-7 w-7 items-center justify-center rounded text-[var(--bt-muted)] hover:bg-[var(--bt-panel-bg-muted)] hover:text-[var(--bt-text)]"
          aria-label="Close breakdown"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
            <path d="M3 3l8 8M11 3L3 11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
        <h2 className="flex-1 text-center text-sm font-semibold text-[var(--bt-text)]">Breakdown</h2>
        <span className="w-7" aria-hidden />
      </div>

      <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-3 py-3">
        <section className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between gap-3 text-[13px] font-semibold text-[var(--bt-text)]">
            <span>Total cost</span>
            <span className="tabular-nums">{formatMoney(breakdown.totalCostCents)}</span>
          </div>
          <BucketCostRow label="Material" cents={breakdown.material.costCents} />
          <BucketCostRow label="Labor" cents={breakdown.labor.costCents} />
          <BucketCostRow label="Other" cents={breakdown.other.costCents} />
        </section>

        <section className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between gap-3 text-[13px] font-semibold text-[var(--bt-text)]">
            <span>Total markup</span>
            <span className="tabular-nums">{formatMoney(breakdown.totalMarkupCents)}</span>
          </div>
          <BucketMarkupRow
            label="Material"
            markupBasisPoints={breakdown.material.markupBasisPoints}
            markupCents={breakdown.material.markupCents}
          />
          <BucketMarkupRow
            label="Labor"
            markupBasisPoints={breakdown.labor.markupBasisPoints}
            markupCents={breakdown.labor.markupCents}
          />
          <BucketMarkupRow
            label="Other"
            markupBasisPoints={breakdown.other.markupBasisPoints}
            markupCents={breakdown.other.markupCents}
          />
        </section>

        <section className="flex flex-col gap-1 border-t pt-3" style={{ borderColor: "var(--bt-border)" }}>
          <div className="flex items-baseline justify-between gap-3 py-1 text-[13px] font-semibold text-[var(--bt-text)]">
            <span>Subtotal</span>
            <span className="tabular-nums">{formatMoney(breakdown.subtotalCents)}</span>
          </div>
        </section>

        <section className="mt-auto flex flex-col gap-2 border-t pt-3" style={{ borderColor: "var(--bt-border)" }}>
          <div className="flex items-baseline justify-between gap-3 text-[14px] font-semibold text-[var(--bt-text)]">
            <span className="inline-flex items-center gap-1">
              Estimate total
              <span className="text-[10px] text-[var(--bt-muted)]" aria-hidden>
                ▴
              </span>
            </span>
            <span className="tabular-nums">{formatMoney(breakdown.estimateTotalCents)}</span>
          </div>
          <div
            className="flex items-baseline justify-between gap-3 text-[13px] font-semibold"
            style={{ color: "var(--bt-primary)" }}
          >
            <span className="inline-flex items-center gap-1">
              Profit margin
              <span
                className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border text-[9px] font-bold opacity-80"
                style={{ borderColor: "currentColor" }}
                title="Profit ÷ estimate total"
                aria-label="Profit margin info"
              >
                i
              </span>
            </span>
            <span className="tabular-nums">{formatPercent(breakdown.profitMarginBasisPoints)}</span>
          </div>
        </section>
      </div>
    </aside>
  );
}
