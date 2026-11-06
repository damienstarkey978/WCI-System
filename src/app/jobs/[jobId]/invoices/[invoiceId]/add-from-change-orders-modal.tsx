"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { formatMoney } from "@/lib/format";

import { addChangeOrderLinesToInvoiceAction } from "../actions";

export type ChangeOrderAddFromRow = {
  readonly sourceKey: string;
  readonly groupLabel: string;
  readonly title: string;
  readonly costCodeLabel: string;
  readonly costTypeLabel: string;
  readonly clientPriceCents: number;
  readonly alreadyInvoicedCents: number;
  /** Remaining % of client price available to invoice, 0–100. */
  readonly remainingPercent: number;
};

function percentOf(cents: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(100, Math.round((cents / total) * 1000) / 10);
}

/**
 * Buildertrend "Add line items to invoice" / Change Order Line Items picker.
 * Staff pick CO lines, set New invoice %, then append onto the draft.
 */
export function AddFromChangeOrdersModal({
  jobId,
  invoiceId,
  rows,
  open,
  onClose,
}: {
  readonly jobId: string;
  readonly invoiceId: string;
  readonly rows: readonly ChangeOrderAddFromRow[];
  readonly open: boolean;
  readonly onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [percents, setPercents] = useState<Record<string, string>>(() =>
    Object.fromEntries(rows.map((row) => [row.sourceKey, row.remainingPercent > 0 ? String(row.remainingPercent) : "0"])),
  );
  const [adjustAll, setAdjustAll] = useState("100");

  const groups = useMemo(() => {
    const map = new Map<string, ChangeOrderAddFromRow[]>();
    for (const row of rows) {
      const list = map.get(row.groupLabel) ?? [];
      list.push(row);
      map.set(row.groupLabel, list);
    }
    return [...map.entries()];
  }, [rows]);

  const subtotalCents = useMemo(() => {
    let sum = 0;
    for (const row of rows) {
      if (!selected[row.sourceKey]) continue;
      const pct = Number.parseFloat(percents[row.sourceKey] ?? "0");
      if (!Number.isFinite(pct) || pct <= 0) continue;
      sum += Math.round((row.clientPriceCents * pct) / 100);
    }
    return sum;
  }, [rows, selected, percents]);

  if (!open) return null;

  function applyAll() {
    const next = adjustAll.trim() || "0";
    const noneSelected = Object.values(selected).every((value) => !value);
    setPercents((current) => {
      const updated = { ...current };
      for (const row of rows) {
        if (noneSelected || selected[row.sourceKey]) updated[row.sourceKey] = next;
      }
      return updated;
    });
    if (noneSelected) {
      setSelected(Object.fromEntries(rows.map((row) => [row.sourceKey, true])));
    }
  }

  function toggleAll(checked: boolean) {
    setSelected(Object.fromEntries(rows.map((row) => [row.sourceKey, checked])));
  }

  function submit() {
    setError(null);
    const formData = new FormData();
    formData.set("jobId", jobId);
    formData.set("invoiceId", invoiceId);
    for (const row of rows) {
      if (!selected[row.sourceKey]) continue;
      formData.append("sourceKey", row.sourceKey);
      formData.append("invoicePercent", percents[row.sourceKey] ?? "0");
    }
    startTransition(async () => {
      const result = await addChangeOrderLinesToInvoiceAction({}, formData);
      if (result.error) {
        setError(result.error);
        return;
      }
      onClose();
      router.refresh();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <button type="button" className="absolute inset-0 bg-black/50" aria-label="Close" onClick={onClose} />
      <div
        className="relative flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-t-lg bg-white shadow-xl sm:rounded-lg"
        role="dialog"
        aria-modal="true"
        aria-label="Add line items to invoice"
      >
        <header className="flex shrink-0 items-center justify-between border-b px-4 py-3" style={{ borderColor: "var(--bt-border)" }}>
          <h2 className="text-base font-semibold text-[var(--bt-text)]">Add line items to invoice</h2>
          <button type="button" onClick={onClose} className="rounded px-2 py-1 text-sm text-[var(--bt-muted)] hover:bg-black/5">
            Close
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          <h3 className="text-sm font-semibold text-[var(--bt-text)]">Change Order Line Items</h3>
          <p className="mt-1 text-xs text-[var(--bt-muted)]">
            Choose a percent or amount of each change-order line to add to this invoice. Already-invoiced portions are
            shown in the overview bar.
          </p>

          <p className="mt-3 text-xs text-[var(--bt-muted)]">
            Line descriptions include the change-order number and cost code.
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium text-[var(--bt-muted)]">Adjust Invoice %</span>
            <input
              value={adjustAll}
              onChange={(event) => setAdjustAll(event.target.value)}
              inputMode="decimal"
              className="w-20 rounded border px-2 py-1.5 text-sm outline-none focus:border-[var(--bt-primary)]"
              style={{ borderColor: "var(--bt-border)" }}
            />
            <span className="text-[var(--bt-muted)]">%</span>
            <button
              type="button"
              onClick={applyAll}
              className="rounded border px-2.5 py-1.5 text-xs font-medium text-[var(--bt-primary)] hover:bg-sky-50"
              style={{ borderColor: "var(--bt-border)" }}
            >
              Apply all
            </button>
          </div>

          {rows.length === 0 ? (
            <p className="mt-6 text-sm text-[var(--bt-muted)]">
              No approved change orders on this job, or everything is already fully invoiced.
            </p>
          ) : (
            <div className="mt-4 overflow-x-auto rounded border" style={{ borderColor: "var(--bt-border)" }}>
              <table className="w-full min-w-[48rem] text-left text-sm">
                <thead>
                  <tr
                    className="border-b text-[10px] font-semibold uppercase tracking-wide text-[var(--bt-muted)]"
                    style={{ borderColor: "var(--bt-border)", background: "var(--bt-panel-bg-muted)" }}
                  >
                    <th className="px-2 py-2">
                      <input
                        type="checkbox"
                        aria-label="Select all"
                        checked={rows.length > 0 && rows.every((row) => selected[row.sourceKey])}
                        onChange={(event) => toggleAll(event.target.checked)}
                      />
                    </th>
                    <th className="px-2 py-2">Title</th>
                    <th className="px-2 py-2">Cost code</th>
                    <th className="px-2 py-2">Cost types</th>
                    <th className="px-2 py-2 text-right">Client price</th>
                    <th className="px-2 py-2">Invoice overview</th>
                    <th className="px-2 py-2 text-right">New invoice %</th>
                    <th className="px-2 py-2 text-right">New invoice amount</th>
                  </tr>
                </thead>
                <tbody>
                  {groups.map(([group, groupRows]) => (
                    <GroupRows
                      key={group}
                      group={group}
                      rows={groupRows}
                      selected={selected}
                      percents={percents}
                      onToggle={(key, checked) => setSelected((current) => ({ ...current, [key]: checked }))}
                      onPercent={(key, value) => setPercents((current) => ({ ...current, [key]: value }))}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
        </div>

        <footer
          className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t px-4 py-3"
          style={{ borderColor: "var(--bt-border)" }}
        >
          <div className="text-sm text-[var(--bt-text)]">
            Subtotal <span className="font-semibold tabular-nums">{formatMoney(subtotalCents)}</span>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded border px-3 py-2 text-sm font-medium text-[var(--bt-muted)] hover:bg-black/5"
              style={{ borderColor: "var(--bt-border)" }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={pending || subtotalCents <= 0}
              className="rounded bg-[var(--bt-primary)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {pending ? "Adding…" : "Add line items to invoice"}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

function GroupRows({
  group,
  rows,
  selected,
  percents,
  onToggle,
  onPercent,
}: {
  group: string;
  rows: readonly ChangeOrderAddFromRow[];
  selected: Record<string, boolean>;
  percents: Record<string, string>;
  onToggle: (key: string, checked: boolean) => void;
  onPercent: (key: string, value: string) => void;
}) {
  return (
    <>
      <tr className="border-b" style={{ borderColor: "var(--bt-border)", background: "var(--bt-panel-bg-muted)" }}>
        <td colSpan={8} className="px-2 py-1.5 text-xs font-semibold text-[var(--bt-text)]">
          {group}
        </td>
      </tr>
      {rows.map((row) => {
        const pct = Number.parseFloat(percents[row.sourceKey] ?? "0");
        const amountCents = Number.isFinite(pct) && pct > 0 ? Math.round((row.clientPriceCents * pct) / 100) : 0;
        const billedPct = percentOf(row.alreadyInvoicedCents, row.clientPriceCents);
        const newPct = selected[row.sourceKey] && Number.isFinite(pct) ? Math.max(0, pct) : 0;
        return (
          <tr key={row.sourceKey} className="border-b last:border-0" style={{ borderColor: "var(--bt-border)" }}>
            <td className="px-2 py-2 align-middle">
              <input
                type="checkbox"
                checked={Boolean(selected[row.sourceKey])}
                onChange={(event) => onToggle(row.sourceKey, event.target.checked)}
                aria-label={`Select ${row.title}`}
              />
            </td>
            <td className="px-2 py-2 text-[var(--bt-text)]">{row.title}</td>
            <td className="px-2 py-2 text-[var(--bt-muted)]">{row.costCodeLabel || "—"}</td>
            <td className="px-2 py-2 text-[var(--bt-muted)]">{row.costTypeLabel}</td>
            <td className="px-2 py-2 text-right tabular-nums text-[var(--bt-text)]">{formatMoney(row.clientPriceCents)}</td>
            <td className="px-2 py-2">
              <div className="h-2 w-28 overflow-hidden rounded-full bg-slate-100" title={`${billedPct}% invoiced`}>
                <div className="flex h-full">
                  <div className="h-full bg-emerald-500" style={{ width: `${billedPct}%` }} />
                  <div className="h-full bg-sky-400" style={{ width: `${Math.min(100 - billedPct, newPct)}%` }} />
                </div>
              </div>
            </td>
            <td className="px-2 py-2 text-right">
              <input
                value={percents[row.sourceKey] ?? "0"}
                onChange={(event) => {
                  onPercent(row.sourceKey, event.target.value);
                  if (!selected[row.sourceKey]) onToggle(row.sourceKey, true);
                }}
                inputMode="decimal"
                className="w-20 rounded border px-2 py-1 text-right text-sm outline-none focus:border-[var(--bt-primary)]"
                style={{ borderColor: "var(--bt-border)" }}
              />
            </td>
            <td className="px-2 py-2 text-right tabular-nums text-[var(--bt-text)]">{formatMoney(amountCents)}</td>
          </tr>
        );
      })}
    </>
  );
}
