"use client";

import { useMemo, useState } from "react";

import type { CostCodeOption } from "./CostCodeLineItems";

const COST_TYPES = [
  { value: "NONE", label: "None" },
  { value: "LABOR", label: "Labor" },
  { value: "MATERIAL", label: "Material" },
  { value: "EQUIPMENT", label: "Equipment" },
  { value: "SUBCONTRACTOR", label: "Subcontractor" },
  { value: "OTHER", label: "Other" },
] as const;

interface DraftLine {
  readonly key: number;
  title: string;
  costCodeId: string;
  costType: string;
  unitCost: string;
  quantity: string;
  unit: string;
}

function moneyCents(unitCost: string, quantity: string): number {
  const unit = Number.parseFloat(unitCost);
  const qty = Number.parseFloat(quantity || "1");
  if (!Number.isFinite(unit) || !Number.isFinite(qty)) return 0;
  const unitCostCents = Math.round(unit * 100);
  const quantityMilli = Math.round(qty * 1000);
  return Math.round((quantityMilli * unitCostCents) / 1000);
}

function formatDollars(cents: number): string {
  return (cents / 100).toLocaleString(undefined, { style: "currency", currency: "USD" });
}

/**
 * Buildertrend-style Cost table for Purchase Order create/edit: Title, Cost type,
 * Unit cost, Qty, Unit, Builder Cost, required Cost code. Submits the same parallel
 * arrays as CostCodeLineItems plus lineCostType[] for the PO create action.
 */
export function PoCostLineItems({ costCodes }: { costCodes: readonly CostCodeOption[] }) {
  const [lines, setLines] = useState<DraftLine[]>([
    { key: 0, title: "", costCodeId: "", costType: "NONE", unitCost: "", quantity: "1", unit: "" },
  ]);
  const [nextKey, setNextKey] = useState(1);

  const totalCents = useMemo(
    () => lines.reduce((sum, line) => sum + moneyCents(line.unitCost, line.quantity), 0),
    [lines],
  );

  function update(key: number, patch: Partial<DraftLine>) {
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-[var(--bt-text)]">Cost</h3>
      </div>

      <div className="overflow-x-auto rounded border" style={{ borderColor: "var(--bt-border)" }}>
        <table className="w-full min-w-[40rem] text-left text-sm">
          <thead>
            <tr className="border-b bg-black/[0.03] text-xs font-semibold text-[var(--bt-muted)]" style={{ borderColor: "var(--bt-border)" }}>
              <th className="px-2 py-2">Items</th>
              <th className="px-2 py-2">Cost type</th>
              <th className="px-2 py-2">Unit cost</th>
              <th className="px-2 py-2">Quantity</th>
              <th className="px-2 py-2">Unit</th>
              <th className="px-2 py-2 text-right">Builder Cost</th>
              <th className="w-8 px-1 py-2" />
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => {
              const builderCents = moneyCents(line.unitCost, line.quantity);
              return (
                <tr key={line.key} className="border-b align-top last:border-0" style={{ borderColor: "var(--bt-border)" }}>
                  <td className="px-2 py-2" colSpan={7}>
                    <div className="grid gap-2 sm:grid-cols-[minmax(0,1.4fr)_7.5rem_6.5rem_4.5rem_4rem_6.5rem_auto]">
                      <label className="grid gap-0.5">
                        <span className="text-[10px] font-medium text-[var(--bt-muted)]">Title</span>
                        <input
                          name="lineTitle"
                          required
                          value={line.title}
                          onChange={(event) => update(line.key, { title: event.target.value })}
                          className="rounded border px-2 py-1.5 text-sm outline-none focus:border-[var(--bt-primary)]"
                          style={{ borderColor: "var(--bt-border)" }}
                        />
                      </label>
                      <label className="grid gap-0.5">
                        <span className="text-[10px] font-medium text-[var(--bt-muted)]">Cost type</span>
                        <select
                          name="lineCostType"
                          value={line.costType}
                          onChange={(event) => update(line.key, { costType: event.target.value })}
                          className="rounded border px-2 py-1.5 text-sm outline-none focus:border-[var(--bt-primary)]"
                          style={{ borderColor: "var(--bt-border)" }}
                        >
                          {COST_TYPES.map((type) => (
                            <option key={type.value} value={type.value}>
                              {type.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="grid gap-0.5">
                        <span className="text-[10px] font-medium text-[var(--bt-muted)]">Unit cost</span>
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-[var(--bt-muted)]">$</span>
                          <input
                            name="lineUnitCost"
                            inputMode="decimal"
                            required
                            value={line.unitCost}
                            onChange={(event) => update(line.key, { unitCost: event.target.value })}
                            className="w-full rounded border px-2 py-1.5 text-sm outline-none focus:border-[var(--bt-primary)]"
                            style={{ borderColor: "var(--bt-border)" }}
                          />
                        </div>
                      </label>
                      <label className="grid gap-0.5">
                        <span className="text-[10px] font-medium text-[var(--bt-muted)]">Qty</span>
                        <input
                          name="lineQuantity"
                          inputMode="decimal"
                          value={line.quantity}
                          onChange={(event) => update(line.key, { quantity: event.target.value })}
                          className="w-full rounded border px-2 py-1.5 text-sm outline-none focus:border-[var(--bt-primary)]"
                          style={{ borderColor: "var(--bt-border)" }}
                        />
                      </label>
                      <label className="grid gap-0.5">
                        <span className="text-[10px] font-medium text-[var(--bt-muted)]">Unit</span>
                        <input
                          name="lineUnit"
                          value={line.unit}
                          onChange={(event) => update(line.key, { unit: event.target.value })}
                          placeholder="EA"
                          className="w-full rounded border px-2 py-1.5 text-sm outline-none focus:border-[var(--bt-primary)]"
                          style={{ borderColor: "var(--bt-border)" }}
                        />
                      </label>
                      <div className="grid gap-0.5">
                        <span className="text-[10px] font-medium text-[var(--bt-muted)]">Builder Cost</span>
                        <div className="py-1.5 text-right text-sm font-semibold tabular-nums text-[var(--bt-text)]">
                          {formatDollars(builderCents)}
                        </div>
                      </div>
                      {lines.length > 1 ? (
                        <button
                          type="button"
                          onClick={() => setLines((current) => current.filter((row) => row.key !== line.key))}
                          className="self-end px-1 pb-2 text-xs text-[var(--bt-muted)] hover:text-red-600"
                          aria-label="Remove line item"
                        >
                          ✕
                        </button>
                      ) : (
                        <span />
                      )}
                    </div>

                    <div className="mt-2 max-w-md">
                      <label className="grid gap-0.5">
                        <span className="text-[10px] font-medium text-[var(--bt-muted)]">
                          Cost code <span className="text-red-600">*</span>
                        </span>
                        <select
                          name="lineCostCodeId"
                          required
                          value={line.costCodeId}
                          onChange={(event) => update(line.key, { costCodeId: event.target.value })}
                          className="rounded border px-2 py-1.5 text-sm outline-none focus:border-[var(--bt-primary)]"
                          style={{ borderColor: "var(--bt-border)" }}
                        >
                          <option value="" disabled>
                            Choose cost code
                          </option>
                          {costCodes.map((code) => (
                            <option key={code.id} value={code.id}>
                              {code.code} — {code.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="bg-black/[0.03] text-sm font-semibold text-[var(--bt-text)]">
              <td className="px-2 py-2" colSpan={5}>
                Totals
              </td>
              <td className="px-2 py-2 text-right tabular-nums">{formatDollars(totalCents)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      <button
        type="button"
        onClick={() => {
          setLines((current) => [
            ...current,
            { key: nextKey, title: "", costCodeId: "", costType: "NONE", unitCost: "", quantity: "1", unit: "" },
          ]);
          setNextKey((key) => key + 1);
        }}
        className="self-start rounded border px-3 py-1.5 text-xs font-semibold text-[var(--bt-primary)] hover:bg-black/5"
        style={{ borderColor: "var(--bt-border)" }}
      >
        + Item
      </button>
    </div>
  );
}
