"use client";

import { useActionState, useState } from "react";

import { SCOPES } from "@/lib/api-scopes";

import { createApiKeyAction, type CreateKeyState } from "./actions";

const INITIAL: CreateKeyState = {};

/** Groups "jobs:read"/"jobs:write" -> { resource: "jobs", actions: [...] } for a compact checkbox grid. */
function groupedScopes() {
  const groups = new Map<string, string[]>();
  for (const scope of SCOPES) {
    const [resource] = scope.split(":");
    groups.set(resource, [...(groups.get(resource) ?? []), scope]);
  }
  return [...groups.entries()];
}

const READ_ONLY_SCOPES = SCOPES.filter((scope) => scope.endsWith(":read"));

export function CreateKeyForm() {
  const [state, formAction, pending] = useActionState(createApiKeyAction, INITIAL);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const groups = groupedScopes();

  function toggle(scope: string) {
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(scope)) next.delete(scope);
      else next.add(scope);
      return next;
    });
  }

  if (state.token) {
    return (
      <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-950">
        <p className="font-semibold">
          {state.name ? `"${state.name}" created.` : "Key created."} Copy this token now — it will not be shown again.
        </p>
        <code className="mt-2 block break-all rounded bg-white px-3 py-2 text-xs text-black">{state.token}</code>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setSelected(new Set());
            window.location.reload();
          }}
          className="mt-3 rounded bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white"
        >
          Done
        </button>
      </div>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded px-4 py-2 text-sm font-semibold text-[var(--bt-on-primary)]"
        style={{ background: "var(--bt-primary)" }}
      >
        + New API key
      </button>
    );
  }

  return (
    <form action={formAction} className="rounded-lg border bg-[var(--bt-panel-bg)] p-4" style={{ borderColor: "var(--bt-border)" }}>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm">
          <span className="text-xs font-medium text-[var(--bt-muted)]">Name</span>
          <input
            name="name"
            required
            placeholder="Claude Desktop (MCP)"
            className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]"
            style={{ borderColor: "var(--bt-border)" }}
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-xs font-medium text-[var(--bt-muted)]">Expires</span>
          <select
            name="expiresInDays"
            defaultValue=""
            className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]"
            style={{ borderColor: "var(--bt-border)" }}
          >
            <option value="">Never</option>
            <option value="30">30 days</option>
            <option value="90">90 days</option>
            <option value="365">1 year</option>
          </select>
        </label>
      </div>

      <div className="mt-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-[var(--bt-muted)]">Scopes</span>
          <button
            type="button"
            onClick={() => setSelected(new Set(READ_ONLY_SCOPES))}
            className="text-xs font-semibold text-[var(--bt-primary)] hover:underline"
          >
            Read-only preset (recommended for MCP)
          </button>
        </div>
        <div className="mt-2 grid max-h-64 grid-cols-2 gap-x-4 gap-y-2 overflow-y-auto rounded border p-3 sm:grid-cols-3" style={{ borderColor: "var(--bt-border)" }}>
          {groups.map(([resource, scopes]) => (
            <div key={resource} className="text-xs">
              <div className="font-semibold text-[var(--bt-text)]">{resource}</div>
              {scopes.map((scope) => (
                <label key={scope} className="flex items-center gap-1.5 py-0.5 text-[var(--bt-muted)]">
                  <input
                    type="checkbox"
                    name="scopes"
                    value={scope}
                    checked={selected.has(scope)}
                    onChange={() => toggle(scope)}
                  />
                  {scope.split(":")[1]}
                </label>
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <button
          type="submit"
          disabled={pending || selected.size === 0}
          className="rounded px-4 py-2 text-sm font-semibold text-[var(--bt-on-primary)] disabled:opacity-50"
          style={{ background: "var(--bt-primary)" }}
        >
          {pending ? "Creating…" : "Create key"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-sm text-[var(--bt-muted)] hover:underline">
          Cancel
        </button>
        {state.error ? (
          <p role="alert" className="text-xs text-red-600">
            {state.error}
          </p>
        ) : null}
      </div>
    </form>
  );
}
