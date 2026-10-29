"use client";

import { useActionState } from "react";

import { formatTime } from "@/lib/format";

import { clockInAction, type ActionState } from "./actions";

const INITIAL: ActionState = {};

export function ClockInForm({
  jobId,
  jobName,
  users,
  costCodes,
  defaultUserId,
}: {
  jobId: string;
  jobName: string;
  users: readonly { id: string; name: string | null; email: string }[];
  costCodes: readonly { id: string; code: string; name: string }[];
  defaultUserId: string;
}) {
  const [state, formAction, pending] = useActionState(clockInAction, INITIAL);
  const nowLabel = formatTime(new Date());

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="jobId" value={jobId} />

      <div className="text-center">
        <p className="text-xs font-medium text-[var(--bt-muted)]">Current shift</p>
        <p className="text-2xl font-semibold text-[var(--bt-text)]">{nowLabel}</p>
      </div>

      <label className="grid gap-1 text-sm">
        <span className="text-xs font-medium text-[var(--bt-muted)]">Job</span>
        <input value={jobName} readOnly className="rounded border px-3 py-2 text-sm opacity-80" style={{ borderColor: "var(--bt-border)", background: "var(--bt-bg)" }} />
      </label>

      <label className="grid gap-1 text-sm">
        <span className="text-xs font-medium text-[var(--bt-muted)]">User</span>
        <select name="userId" required defaultValue={defaultUserId} className="rounded border px-3 py-2 text-sm" style={{ borderColor: "var(--bt-border)" }}>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name || u.email}
            </option>
          ))}
        </select>
      </label>

      <label className="grid gap-1 text-sm">
        <span className="text-xs font-medium text-[var(--bt-muted)]">Cost code</span>
        <select name="costCodeId" required defaultValue={costCodes[0]?.id ?? ""} className="rounded border px-3 py-2 text-sm" style={{ borderColor: "var(--bt-border)" }}>
          {costCodes.length === 0 ? <option value="">No cost codes</option> : null}
          {costCodes.map((cc) => (
            <option key={cc.id} value={cc.id}>
              {cc.code} — {cc.name}
            </option>
          ))}
        </select>
      </label>

      {state.error ? (
        <p role="alert" className="text-xs text-red-600">
          {state.error}
        </p>
      ) : null}

      <button type="submit" disabled={pending || costCodes.length === 0} className="self-end rounded px-4 py-2 text-sm font-semibold text-[var(--bt-on-primary)] disabled:opacity-50" style={{ background: "var(--bt-primary)" }}>
        {pending ? "Clocking in…" : "Clock in"}
      </button>
    </form>
  );
}
