"use client";

import { useActionState } from "react";

import { updateNocNtboDetailsAction, type ActionState } from "../actions";

const INITIAL: ActionState = {};

function dateInputValue(value: Date | string | null | undefined): string {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

export function NocNtboForm({
  jobId,
  nocOnFile,
  ntboFiled,
  nocNumber,
  ntboNumber,
  nocFiledOn,
  ntboFiledOn,
}: {
  jobId: string;
  nocOnFile: boolean;
  ntboFiled: boolean;
  nocNumber: string | null;
  ntboNumber: string | null;
  nocFiledOn: Date | string | null;
  ntboFiledOn: Date | string | null;
}) {
  const [state, formAction, pending] = useActionState(updateNocNtboDetailsAction, INITIAL);

  return (
    <form action={formAction} className="mt-3 grid gap-2">
      <input type="hidden" name="jobId" value={jobId} />
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="flex items-center gap-2 text-xs text-[var(--bt-text)]">
          <input
            type="checkbox"
            name="nocOnFile"
            value="true"
            defaultChecked={nocOnFile}
            className="rounded border"
            style={{ borderColor: "var(--bt-border)" }}
          />
          NOC on file
        </label>
        <label className="flex items-center gap-2 text-xs text-[var(--bt-text)]">
          <input
            type="checkbox"
            name="ntboFiled"
            value="true"
            defaultChecked={ntboFiled}
            className="rounded border"
            style={{ borderColor: "var(--bt-border)" }}
          />
          NTBO filed
        </label>
        <label className="grid gap-0.5 text-[11px] text-[var(--bt-muted)]">
          NOC number
          <input
            name="nocNumber"
            type="text"
            defaultValue={nocNumber ?? ""}
            className="rounded border bg-white px-2 py-1.5 text-xs text-[var(--bt-text)]"
            style={{ borderColor: "var(--bt-border)" }}
          />
        </label>
        <label className="grid gap-0.5 text-[11px] text-[var(--bt-muted)]">
          NOC filed date
          <input
            name="nocFiledOn"
            type="date"
            defaultValue={dateInputValue(nocFiledOn)}
            className="rounded border bg-white px-2 py-1.5 text-xs text-[var(--bt-text)]"
            style={{ borderColor: "var(--bt-border)" }}
          />
        </label>
        <label className="grid gap-0.5 text-[11px] text-[var(--bt-muted)]">
          NTBO number
          <input
            name="ntboNumber"
            type="text"
            defaultValue={ntboNumber ?? ""}
            className="rounded border bg-white px-2 py-1.5 text-xs text-[var(--bt-text)]"
            style={{ borderColor: "var(--bt-border)" }}
          />
        </label>
        <label className="grid gap-0.5 text-[11px] text-[var(--bt-muted)]">
          NTBO filed date
          <input
            name="ntboFiledOn"
            type="date"
            defaultValue={dateInputValue(ntboFiledOn)}
            className="rounded border bg-white px-2 py-1.5 text-xs text-[var(--bt-text)]"
            style={{ borderColor: "var(--bt-border)" }}
          />
        </label>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded px-2.5 py-1.5 text-xs font-semibold text-[var(--bt-on-primary)] disabled:opacity-50"
          style={{ background: "var(--bt-primary)" }}
        >
          {pending ? "Saving…" : "Save NOC / NTBO"}
        </button>
        {state.error ? <p className="text-xs text-red-600">{state.error}</p> : null}
        {state.ok ? <p className="text-xs text-[var(--bt-muted)]">Saved.</p> : null}
      </div>
    </form>
  );
}
