"use client";

import { useActionState } from "react";

import { inviteVendorToBidAction, type ActionState } from "./actions";

const INITIAL: ActionState = {};

export interface VendorOption {
  readonly id: string;
  readonly name: string;
}

export function InviteVendorForm({ jobId, bidPackageId, vendors }: { jobId: string; bidPackageId: string; vendors: readonly VendorOption[] }) {
  const [state, formAction, pending] = useActionState(inviteVendorToBidAction, INITIAL);

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="jobId" value={jobId} />
      <input type="hidden" name="bidPackageId" value={bidPackageId} />
      <select
        name="vendorId"
        required
        defaultValue=""
        className="rounded border px-2 py-1 text-xs outline-none focus:border-[var(--bt-primary)]"
        style={{ borderColor: "var(--bt-border)" }}
      >
        <option value="" disabled>
          Invite a vendor…
        </option>
        {vendors.map((vendor) => (
          <option key={vendor.id} value={vendor.id}>
            {vendor.name}
          </option>
        ))}
      </select>
      <button type="submit" disabled={pending} className="rounded px-2 py-1 text-xs font-semibold text-white disabled:opacity-50" style={{ background: "var(--bt-primary)" }}>
        {pending ? "Inviting…" : "Invite"}
      </button>
      {state.error ? <span className="text-xs text-red-600">{state.error}</span> : null}
    </form>
  );
}
