"use client";

import { useRef, useState } from "react";

export interface CostCodeOption {
  readonly id: string;
  readonly code: string;
  readonly name: string;
}

/** A Materials Catalog item (src/lib/materials/service.ts), trimmed to what a line item needs. */
export interface MaterialOption {
  readonly id: string;
  readonly description: string;
  readonly unit: string;
  readonly unitCostCents: number;
  readonly vendor: string;
}

interface Row {
  readonly key: number;
}

/**
 * Repeatable cost-code line item rows shared by Purchase Orders, Bills, and
 * Estimate creation forms — all three price a job against the same CostCode
 * catalog. Submits as parallel arrays (lineCostCodeId[], lineTitle[],
 * lineQuantity[], lineUnitCost[]) that the server action zips back together.
 *
 * When `materials` is passed (currently just Estimate creation), each row
 * gets a "Pick from catalog" select — the cost-catalog entry method CLAUDE.md
 * 3 calls for. Picking one autofills that row's title/unit cost inputs
 * directly via the DOM rather than lifting them into React state, since the
 * rest of this component is deliberately uncontrolled.
 */
export function CostCodeLineItems({ costCodes, materials = [] }: { costCodes: readonly CostCodeOption[]; materials?: readonly MaterialOption[] }) {
  const [rows, setRows] = useState<Row[]>([{ key: 0 }]);
  const [nextKey, setNextKey] = useState(1);
  const rowRefs = useRef(new Map<number, HTMLDivElement>());

  function applyMaterial(rowKey: number, materialId: string) {
    const material = materials.find((m) => m.id === materialId);
    const container = rowRefs.current.get(rowKey);
    if (!material || !container) return;

    const titleInput = container.querySelector<HTMLInputElement>('input[name="lineTitle"]');
    const unitCostInput = container.querySelector<HTMLInputElement>('input[name="lineUnitCost"]');
    if (titleInput) titleInput.value = material.description;
    if (unitCostInput) unitCostInput.value = (material.unitCostCents / 100).toFixed(2);
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-medium text-[var(--bt-muted)]">Line items</span>
      {rows.map((row) => (
        <div
          key={row.key}
          ref={(el) => {
            if (el) rowRefs.current.set(row.key, el);
            else rowRefs.current.delete(row.key);
          }}
          className="flex flex-wrap gap-2"
        >
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
          {materials.length > 0 ? (
            <select
              className="rounded border px-2 py-2 text-sm outline-none focus:border-[var(--bt-primary)]"
              style={{ borderColor: "var(--bt-border)" }}
              defaultValue=""
              onChange={(event) => {
                if (event.target.value) applyMaterial(row.key, event.target.value);
                event.target.value = "";
              }}
            >
              <option value="" disabled>
                Pick from catalog…
              </option>
              {materials.map((material) => (
                <option key={material.id} value={material.id}>
                  {material.description} ({material.vendor}, {(material.unitCostCents / 100).toFixed(2)}/{material.unit})
                </option>
              ))}
            </select>
          ) : null}
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
