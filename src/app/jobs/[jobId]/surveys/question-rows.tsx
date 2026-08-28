"use client";

import { useState } from "react";

interface Row {
  readonly key: number;
}

export function QuestionRows() {
  const [rows, setRows] = useState<Row[]>([{ key: 0 }]);
  const [nextKey, setNextKey] = useState(1);

  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-medium text-[var(--bt-muted)]">Questions</span>
      {rows.map((row) => (
        <div key={row.key} className="flex gap-2">
          <input
            name="questionPrompt"
            placeholder="Question"
            className="flex-1 rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]"
            style={{ borderColor: "var(--bt-border)" }}
          />
          {rows.length > 1 ? (
            <button
              type="button"
              onClick={() => setRows((current) => current.filter((r) => r.key !== row.key))}
              className="px-2 text-xs text-[var(--bt-muted)] hover:text-red-600"
              aria-label="Remove question"
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
        + Add question
      </button>
    </div>
  );
}
