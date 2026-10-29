"use client";

import { useActionState } from "react";

import type { UserRole } from "@/generated/prisma/enums";
import {
  SITE_ACCESS_FLAG_KEYS,
  SITE_ACCESS_FLAG_LABELS,
  type RoleSiteAccessFlags,
} from "@/lib/staff/role-site-access-shared";

import { updateRoleSiteAccessAction, type RoleAccessActionState } from "./actions";

const INITIAL: RoleAccessActionState = {};

export function RoleAccessForm({
  role,
  label,
  blurb,
  flags,
  memberCount,
}: {
  role: UserRole;
  label: string;
  blurb: string;
  flags: RoleSiteAccessFlags;
  memberCount: number;
}) {
  const [state, formAction, pending] = useActionState(updateRoleSiteAccessAction, INITIAL);

  return (
    <form
      action={formAction}
      className="rounded-lg border bg-[var(--bt-panel-bg)] p-4"
      style={{ borderColor: "var(--bt-border)" }}
    >
      <input type="hidden" name="role" value={role} />
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-[var(--bt-primary)]">{label}</h2>
        <span className="text-xs text-[var(--bt-muted)]">
          {memberCount} {memberCount === 1 ? "person" : "people"}
        </span>
      </div>
      <p className="mt-1 text-sm text-[var(--bt-text)]">{blurb}</p>

      <fieldset className="mt-3 grid gap-2 sm:grid-cols-2">
        <legend className="sr-only">Site access for {label}</legend>
        {SITE_ACCESS_FLAG_KEYS.map((key) => (
          <label key={key} className="flex items-center gap-2 text-sm text-[var(--bt-text)]">
            <input
              type="checkbox"
              name={key}
              defaultChecked={flags[key]}
              className="rounded border"
              style={{ borderColor: "var(--bt-border)" }}
            />
            <span>
              {SITE_ACCESS_FLAG_LABELS[key]}
              {role === "SALES_REP" && key === "canAccessFinancials" ? (
                <span className="ml-1 text-xs text-[var(--bt-muted)]">(default off — Commission still available)</span>
              ) : null}
            </span>
          </label>
        ))}
      </fieldset>

      {state.error ? (
        <p role="alert" className="mt-2 text-xs text-red-600">
          {state.error}
        </p>
      ) : null}
      {state.ok ? (
        <p role="status" className="mt-2 text-xs text-green-700 dark:text-green-400">
          Saved.
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="mt-3 rounded px-3 py-1.5 text-xs font-semibold text-[var(--bt-on-primary)] disabled:opacity-50"
        style={{ background: "var(--bt-primary)" }}
      >
        {pending ? "Saving…" : "Save access"}
      </button>
    </form>
  );
}
