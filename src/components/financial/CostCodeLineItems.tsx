"use client";

import { useState } from "react";

export interface CostCodeOption {
  readonly id: string;
  readonly code: string;
  readonly name: string;
}

interface Row {
  readonly key: number;
}

/**
 * Repeatable cost-code line item rows shared by Purchase Orders, Bills, and
 * Estimate creation forms — all three price a job against the same CostCode
 * catalog. Submits as parallel arrays (lineCostCodeId[], lineTitle[],
 * lineQuantity[], lineUnitCost[]) that the server action zips back together.
 */
export function CostCodeLineItems({ costCodes }: { costCodes: readonly CostCodeOption[] }) {
  const [rows, setRows] = useState<Row[]>([{ key: 0 }]);
  const [nextKey, setNextKey] = useState(1);

  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-medium text-[var(--bt-muted)]">Line items</span>
      {rows.map((row) => (
        <div key={row.key} className="flex flex-wrap gap-2">
          <select
            name="lineCostCodeId"
            required
            className="rounded border px-2 py-2 text-sm outline-none focus:border-[var(--bt-primary)]"
            style={{ borderColor: "var(--bt-border)" }}
            defaultValue=""
          >
            <option value="" disabled>
              Cost code
            </option>
            {costCodes.map((code) => (
              <option key={code.id} value={code.id}>
                {code.code} — {code.name}
              </option>
            ))}
          </select>
          <input
            name="lineTitle"
            placeholder="Description"
            required
            className="min-w-[10rem] flex-1 rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]"
            style={{ borderColor: "var(--bt-border)" }}
          />
          <input
            name="lineQuantity"
            inputMode="decimal"
            placeholder="Qty"
            defaultValue="1"
            className="w-20 rounded border px-2 py-2 text-sm outline-none focus:border-[var(--bt-primary)]"
            style={{ borderColor: "var(--bt-border)" }}
          />
          <input
            name="lineUnitCost"
            inputMode="decimal"
            placeholder="Unit cost"
            required
            className="w-28 rounded border px-2 py-2 text-sm outline-none focus:border-[var(--bt-primary)]"
            style={{ borderColor: "var(--bt-border)" }}
          />
          {rows.length > 1 ? (
            <button
              type="button"
              onClick={() => setRows((current) => current.filter((r) => r.key !== row.key))}
              className="px-2 text-xs text-[var(--bt-muted)] hover:text-red-600"
              aria-label="Remove line item"
            >
              ✕
            </button>
          ) : null}
        </div>
      ))}
      <button
        type="button"
        onClick={() => {
          setRows((current) => [...current, { key: nextKey }]);
          setNextKey((k) => k + 1);
        }}
        className="self-start text-xs font-medium text-[var(--bt-primary)] hover:underline"
      >
        + Add line item
      </button>
    </div>
  );
}
