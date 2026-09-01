"use client";

import { useActionState } from "react";

import type { UserRole } from "@/generated/prisma/enums";
import { ASSIGNABLE_STAFF_ROLES, ROLE_DESCRIPTIONS } from "@/lib/staff/role-descriptions";

import { updateStaffRoleAction, type ActionState } from "./actions";

const INITIAL: ActionState = {};

export function RoleForm({ userId, currentRole }: { userId: string; currentRole: UserRole }) {
  const [state, formAction, pending] = useActionState(updateStaffRoleAction, INITIAL);

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="userId" value={userId} />
      <label className="grid gap-1 text-sm">
        <span className="text-xs font-medium text-[var(--bt-muted)]">Role</span>
        <select
          name="role"
          defaultValue={currentRole}
          className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]"
          style={{ borderColor: "var(--bt-border)" }}
        >
          {ASSIGNABLE_STAFF_ROLES.map((role) => (
            <option key={role} value={role}>
              {ROLE_DESCRIPTIONS[role].label}
            </option>
          ))}
        </select>
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded px-4 py-2 text-sm font-semibold text-[var(--bt-on-primary)] disabled:opacity-50"
        style={{ background: "var(--bt-primary)" }}
      >
        {pending ? "Saving…" : "Change role"}
      </button>
      {state.error ? (
        <p role="alert" className="w-full text-xs text-red-600">
          {state.error}
        </p>
      ) : null}
      {state.ok ? <p className="w-full text-xs text-emerald-700">Role updated.</p> : null}
    </form>
  );
}
