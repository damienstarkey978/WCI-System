"use client";

import { useState } from "react";

interface Row {
  readonly key: number;
}

/** Repeatable option rows for a new Selection — title, cost, and client price per option. */
export function SelectionOptionRows() {
  const [rows, setRows] = useState<Row[]>([{ key: 0 }, { key: 1 }]);
  const [nextKey, setNextKey] = useState(2);

  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-medium text-[var(--bt-muted)]">Options</span>
      {rows.map((row) => (
        <div key={row.key} className="flex flex-wrap gap-2">
          <input
            name="optionTitle"
            placeholder="Option title"
            className="min-w-[10rem] flex-1 rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]"
            style={{ borderColor: "var(--bt-border)" }}
          />
          <input
            name="optionPrice"
            inputMode="decimal"
            placeholder="Cost"
            className="w-28 rounded border px-2 py-2 text-sm outline-none focus:border-[var(--bt-primary)]"
            style={{ borderColor: "var(--bt-border)" }}
          />
          <input
            name="optionClientPrice"
            inputMode="decimal"
            placeholder="Client price"
            className="w-28 rounded border px-2 py-2 text-sm outline-none focus:border-[var(--bt-primary)]"
            style={{ borderColor: "var(--bt-border)" }}
          />
          {rows.length > 1 ? (
            <button
              type="button"
              onClick={() => setRows((current) => current.filter((r) => r.key !== row.key))}
              className="px-2 text-xs text-[var(--bt-muted)] hover:text-red-600"
              aria-label="Remove option"
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
        + Add option
      </button>
    </div>
  );
}
