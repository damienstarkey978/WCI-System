"use client";

import { useActionState, useTransition } from "react";

import { grantClientAccessAction, revokeClientAccessAction, updateClientAccessAction, type ActionState } from "./actions";

const INITIAL: ActionState = {};

export interface ClientAccessRow {
  readonly clientId: string;
  readonly name: string;
  readonly email: string;
  readonly canViewDailyLogs: boolean;
  readonly canViewSchedule: boolean;
  readonly canViewDocuments: boolean;
  readonly canViewBudget: boolean;
  readonly canViewInvoices: boolean;
  readonly canMakePayments: boolean;
  readonly canViewBills: boolean;
  readonly canViewSelections: boolean;
  readonly canApproveSelections: boolean;
  readonly canViewChangeOrders: boolean;
  readonly canApproveChangeOrders: boolean;
}

const PERMISSIONS: readonly { key: keyof ClientAccessRow; label: string }[] = [
  { key: "canViewDailyLogs", label: "View daily logs" },
  { key: "canViewSchedule", label: "View schedule" },
  { key: "canViewDocuments", label: "View documents" },
  { key: "canViewBudget", label: "View budget" },
  { key: "canViewInvoices", label: "View invoices" },
  { key: "canMakePayments", label: "Make payments" },
  { key: "canViewBills", label: "View bills" },
  { key: "canViewSelections", label: "View selections" },
  { key: "canApproveSelections", label: "Approve selections" },
  { key: "canViewChangeOrders", label: "View change orders" },
  { key: "canApproveChangeOrders", label: "Approve change orders" },
];

function ClientAccessCard({ jobId, row }: { jobId: string; row: ClientAccessRow }) {
  const action = updateClientAccessAction.bind(null, jobId);
  const [state, formAction, pending] = useActionState(action, INITIAL);
  const [revoking, startRevoke] = useTransition();

  return (
    <form action={formAction} className="rounded-lg border p-4" style={{ borderColor: "var(--bt-border)" }}>
      <input type="hidden" name="clientId" value={row.clientId} />
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-medium text-[var(--bt-text)]">{row.name}</div>
          <div className="text-xs text-[var(--bt-muted)]">{row.email}</div>
        </div>
        <button
          type="button"
          disabled={revoking}
          onClick={() => startRevoke(() => revokeClientAccessAction(jobId, row.clientId))}
          className="text-xs font-semibold text-red-600 hover:underline disabled:opacity-50"
        >
          {revoking ? "Removing…" : "Remove access"}
        </button>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-[var(--bt-text)] sm:grid-cols-3">
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
          className="rounded px-3 py-1.5 text-xs font-semibold text-[var(--bt-on-primary)] disabled:opacity-50"
          style={{ background: "var(--bt-primary)" }}
        >
          {pending ? "Saving…" : "Save permissions"}
        </button>
        {state.ok ? <span className="text-xs text-emerald-700">Saved.</span> : null}
      </div>
    </form>
  );
}

export function ClientsTab({
  jobId,
  access,
  availableClients,
}: {
  jobId: string;
  access: readonly ClientAccessRow[];
  availableClients: readonly { id: string; name: string; email: string }[];
}) {
  const grantAction = grantClientAccessAction.bind(null, jobId);
  const [state, formAction, pending] = useActionState(grantAction, INITIAL);

  return (
    <div className="flex flex-col gap-4">
      <form action={formAction} className="flex items-end gap-3 rounded-lg border bg-[var(--bt-panel-bg)] p-4" style={{ borderColor: "var(--bt-border)" }}>
        <label className="grid flex-1 gap-1 text-sm">
          <span className="text-xs font-medium text-[var(--bt-muted)]">Choose from existing contacts</span>
          <select name="clientId" required defaultValue="" className="rounded border px-3 py-2 text-sm" style={{ borderColor: "var(--bt-border)" }}>
            <option value="" disabled>
              Select a client…
            </option>
            {availableClients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name} ({client.email})
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          disabled={pending || availableClients.length === 0}
          className="rounded px-4 py-2 text-sm font-semibold text-[var(--bt-on-primary)] disabled:opacity-50"
          style={{ background: "var(--bt-primary)" }}
        >
          {pending ? "Adding…" : "+ Contact"}
        </button>
        {state.error ? (
          <p role="alert" className="text-xs text-red-600">
            {state.error}
          </p>
        ) : null}
      </form>

      {access.length === 0 ? (
        <p className="text-sm text-[var(--bt-muted)]">No clients have access to this job yet.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {access.map((row) => (
            <ClientAccessCard key={row.clientId} jobId={jobId} row={row} />
          ))}
        </div>
      )}
    </div>
  );
}
