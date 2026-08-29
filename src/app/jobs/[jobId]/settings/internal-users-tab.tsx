"use client";

import { useActionState, useTransition } from "react";

import { ScheduleScope, UserRole } from "@/generated/prisma/enums";

import { grantInternalUserAccessAction, revokeInternalUserAccessAction, updateInternalUserAccessAction, type ActionState } from "./actions";

const INITIAL: ActionState = {};

export interface InternalUserAccessRow {
  readonly userId: string;
  readonly name: string;
  readonly role: UserRole;
  readonly scheduleScope: ScheduleScope;
  readonly canViewPricing: boolean;
  readonly canViewCostDetail: boolean;
  readonly canManageSchedule: boolean;
  readonly canApproveChangeOrders: boolean;
  readonly canViewDocuments: boolean;
  readonly canCommunicateWithClient: boolean;
}

const PERMISSIONS: readonly { key: keyof InternalUserAccessRow; label: string }[] = [
  { key: "canViewPricing", label: "View pricing" },
  { key: "canViewCostDetail", label: "View cost detail" },
  { key: "canManageSchedule", label: "Manage schedule" },
  { key: "canApproveChangeOrders", label: "Approve change orders" },
  { key: "canViewDocuments", label: "View documents" },
  { key: "canCommunicateWithClient", label: "Communicate with client" },
];

function InternalUserCard({ jobId, row }: { jobId: string; row: InternalUserAccessRow }) {
  const action = updateInternalUserAccessAction.bind(null, jobId);
  const [state, formAction, pending] = useActionState(action, INITIAL);
  const [revoking, startRevoke] = useTransition();

  return (
    <form action={formAction} className="rounded-lg border p-4" style={{ borderColor: "var(--bt-border)" }}>
      <input type="hidden" name="userId" value={row.userId} />
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-medium text-[var(--bt-text)]">{row.name}</div>
          <div className="text-xs text-[var(--bt-muted)]">{row.role}</div>
        </div>
        <button
          type="button"
          disabled={revoking}
          onClick={() => startRevoke(() => revokeInternalUserAccessAction(jobId, row.userId))}
          className="text-xs font-semibold text-red-600 hover:underline disabled:opacity-50"
        >
          {revoking ? "Removing…" : "Remove access"}
        </button>
      </div>
      <label className="mt-3 flex items-center gap-2 text-xs text-[var(--bt-text)]">
        <input type="checkbox" name="scheduleAllItems" defaultChecked={row.scheduleScope === ScheduleScope.ALL_ITEMS} />
        Can view all schedule items (unchecked = assigned items only)
      </label>
      <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-[var(--bt-text)] sm:grid-cols-3">
        {PERMISSIONS.map((permission) => (
          <label key={permission.key} className="flex items-center gap-1.5">
            <input type="checkbox" name={permission.key} defaultChecked={row[permission.key] as boolean} />
            {permission.label}
          </label>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
          style={{ background: "var(--bt-primary)" }}
        >
          {pending ? "Saving…" : "Save permissions"}
        </button>
        {state.ok ? <span className="text-xs text-emerald-700">Saved.</span> : null}
      </div>
    </form>
  );
}

export function InternalUsersTab({
  jobId,
  access,
  availableStaff,
}: {
  jobId: string;
  access: readonly InternalUserAccessRow[];
  availableStaff: readonly { id: string; name: string | null; email: string; role: UserRole }[];
}) {
  const grantAction = grantInternalUserAccessAction.bind(null, jobId);
  const [state, formAction, pending] = useActionState(grantAction, INITIAL);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-[var(--bt-muted)]">
        Admins, PMs, and Office staff already have org-wide visibility and don&apos;t need a grant here — this list is for extending Field staff to
        specific jobs.
      </p>
      <form action={formAction} className="flex items-end gap-3 rounded-lg border bg-[var(--bt-panel-bg)] p-4" style={{ borderColor: "var(--bt-border)" }}>
        <label className="grid flex-1 gap-1 text-sm">
          <span className="text-xs font-medium text-[var(--bt-muted)]">New internal user</span>
          <select name="userId" required defaultValue="" className="rounded border px-3 py-2 text-sm" style={{ borderColor: "var(--bt-border)" }}>
            <option value="" disabled>
              Select a staff member…
            </option>
            {availableStaff.map((staffMember) => (
              <option key={staffMember.id} value={staffMember.id}>
                {staffMember.name ?? staffMember.email} ({staffMember.role})
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          disabled={pending || availableStaff.length === 0}
          className="rounded px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          style={{ background: "var(--bt-primary)" }}
        >
          {pending ? "Adding…" : "+ Internal user"}
        </button>
        {state.error ? (
          <p role="alert" className="text-xs text-red-600">
            {state.error}
          </p>
        ) : null}
      </form>

      {access.length === 0 ? (
        <p className="text-sm text-[var(--bt-muted)]">No Field-scoped grants on this job yet.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {access.map((row) => (
            <InternalUserCard key={row.userId} jobId={jobId} row={row} />
          ))}
        </div>
      )}
    </div>
  );
}
