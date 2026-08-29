"use client";

import { useActionState, useTransition } from "react";

import { ScheduleScope } from "@/generated/prisma/enums";

import { grantVendorAccessAction, revokeVendorAccessAction, updateVendorAccessAction, type ActionState } from "./actions";

const INITIAL: ActionState = {};

export interface VendorAccessRow {
  readonly vendorId: string;
  readonly name: string;
  readonly tradeType: string | null;
  readonly scheduleScope: ScheduleScope;
  readonly canViewDocuments: boolean;
  readonly canViewPurchaseOrders: boolean;
  readonly canViewBills: boolean;
}

const PERMISSIONS: readonly { key: keyof VendorAccessRow; label: string }[] = [
  { key: "canViewDocuments", label: "View documents" },
  { key: "canViewPurchaseOrders", label: "View purchase orders" },
  { key: "canViewBills", label: "View bills" },
];

function VendorAccessCard({ jobId, row }: { jobId: string; row: VendorAccessRow }) {
  const action = updateVendorAccessAction.bind(null, jobId);
  const [state, formAction, pending] = useActionState(action, INITIAL);
  const [revoking, startRevoke] = useTransition();

  return (
    <form action={formAction} className="rounded-lg border p-4" style={{ borderColor: "var(--bt-border)" }}>
      <input type="hidden" name="vendorId" value={row.vendorId} />
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-medium text-[var(--bt-text)]">{row.name}</div>
          {row.tradeType ? <div className="text-xs text-[var(--bt-muted)]">{row.tradeType}</div> : null}
        </div>
        <button
          type="button"
          disabled={revoking}
          onClick={() => startRevoke(() => revokeVendorAccessAction(jobId, row.vendorId))}
          className="text-xs font-semibold text-red-600 hover:underline disabled:opacity-50"
        >
          {revoking ? "Removing…" : "Remove access"}
        </button>
      </div>
      <label className="mt-3 flex items-center gap-2 text-xs text-[var(--bt-text)]">
        <input type="checkbox" name="scheduleAllItems" defaultChecked={row.scheduleScope === ScheduleScope.ALL_ITEMS} />
        Can view all schedule items (unchecked = assigned items only)
      </label>
      <div className="mt-2 grid grid-cols-3 gap-x-4 gap-y-1 text-xs text-[var(--bt-text)]">
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

export function SubsVendorsTab({
  jobId,
  access,
  availableVendors,
}: {
  jobId: string;
  access: readonly VendorAccessRow[];
  availableVendors: readonly { id: string; name: string; tradeType: string | null }[];
}) {
  const grantAction = grantVendorAccessAction.bind(null, jobId);
  const [state, formAction, pending] = useActionState(grantAction, INITIAL);

  return (
    <div className="flex flex-col gap-4">
      <form action={formAction} className="flex items-end gap-3 rounded-lg border bg-[var(--bt-panel-bg)] p-4" style={{ borderColor: "var(--bt-border)" }}>
        <label className="grid flex-1 gap-1 text-sm">
          <span className="text-xs font-medium text-[var(--bt-muted)]">New sub/vendor</span>
          <select name="vendorId" required defaultValue="" className="rounded border px-3 py-2 text-sm" style={{ borderColor: "var(--bt-border)" }}>
            <option value="" disabled>
              Select a sub/vendor…
            </option>
            {availableVendors.map((vendor) => (
              <option key={vendor.id} value={vendor.id}>
                {vendor.name}
                {vendor.tradeType ? ` (${vendor.tradeType})` : ""}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          disabled={pending || availableVendors.length === 0}
          className="rounded px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          style={{ background: "var(--bt-primary)" }}
        >
          {pending ? "Adding…" : "+ Sub/vendor"}
        </button>
        {state.error ? (
          <p role="alert" className="text-xs text-red-600">
            {state.error}
          </p>
        ) : null}
      </form>

      {access.length === 0 ? (
        <p className="text-sm text-[var(--bt-muted)]">No subs/vendors have access to this job yet.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {access.map((row) => (
            <VendorAccessCard key={row.vendorId} jobId={jobId} row={row} />
          ))}
        </div>
      )}
    </div>
  );
}
