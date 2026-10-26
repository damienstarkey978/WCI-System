"use client";

import { useActionState } from "react";

import { createSubmittalAction, type ActionState } from "./actions";

const INITIAL: ActionState = {};

const TYPES = [
  { value: "MATERIAL_SPEC", label: "Material spec" },
  { value: "SHOP_DRAWING", label: "Shop drawing" },
  { value: "PRODUCT_DATA", label: "Product data" },
  { value: "SAMPLE", label: "Sample" },
  { value: "OTHER", label: "Other" },
] as const;

export interface UserOption {
  readonly id: string;
  readonly name: string | null;
  readonly email: string;
}

export interface VendorOption {
  readonly id: string;
  readonly name: string;
}

export function CreateSubmittalForm({
  jobId,
  users,
  vendors,
  defaultManagerUserId,
}: {
  jobId: string;
  users: readonly UserOption[];
  vendors: readonly VendorOption[];
  defaultManagerUserId: string;
}) {
  const [state, formAction, pending] = useActionState(createSubmittalAction, INITIAL);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="jobId" value={jobId} />

      <label className="grid gap-1 text-sm">
        <span className="text-xs font-medium text-[var(--bt-muted)]">Title</span>
        <input
          name="title"
          required
          maxLength={50}
          placeholder="Add submittal title"
          className="rounded border px-3 py-2 text-base font-medium outline-none focus:border-[var(--bt-primary)]"
          style={{ borderColor: "var(--bt-border)" }}
        />
        <span className="text-[10px] text-[var(--bt-muted)]">Maximum 50 characters</span>
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm">
          <span className="text-xs font-medium text-[var(--bt-muted)]">Submittal type</span>
          <select name="type" defaultValue="MATERIAL_SPEC" className="rounded border px-3 py-2 text-sm" style={{ borderColor: "var(--bt-border)" }}>
            {TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-xs font-medium text-[var(--bt-muted)]">Package</span>
          <input name="packageName" placeholder="Select or create a package" className="rounded border px-3 py-2 text-sm" style={{ borderColor: "var(--bt-border)" }} />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-xs font-medium text-[var(--bt-muted)]">Division</span>
          <input name="division" placeholder="CSI division" className="rounded border px-3 py-2 text-sm" style={{ borderColor: "var(--bt-border)" }} />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-xs font-medium text-[var(--bt-muted)]">Spec section</span>
          <input name="specSection" className="rounded border px-3 py-2 text-sm" style={{ borderColor: "var(--bt-border)" }} />
        </label>
      </div>

      <label className="grid gap-1 text-sm">
        <span className="text-xs font-medium text-[var(--bt-muted)]">Description</span>
        <textarea name="description" rows={3} className="rounded border px-3 py-2 text-sm" style={{ borderColor: "var(--bt-border)" }} />
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm">
          <span className="text-xs font-medium text-[var(--bt-muted)]">Final due date</span>
          <input type="date" name="finalDueDate" className="rounded border px-3 py-2 text-sm" style={{ borderColor: "var(--bt-border)" }} />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-xs font-medium text-[var(--bt-muted)]">Submittal manager</span>
          <select name="managerUserId" defaultValue={defaultManagerUserId} className="rounded border px-3 py-2 text-sm" style={{ borderColor: "var(--bt-border)" }}>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name || u.email}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-xs font-medium text-[var(--bt-muted)]">Sub/Trade partner</span>
          <select name="vendorId" defaultValue="" className="rounded border px-3 py-2 text-sm" style={{ borderColor: "var(--bt-border)" }}>
            <option value="">None</option>
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-xs font-medium text-[var(--bt-muted)]">Document link</span>
          <input name="documentUrl" type="url" placeholder="https://…" className="rounded border px-3 py-2 text-sm" style={{ borderColor: "var(--bt-border)" }} />
        </label>
      </div>

      <label className="grid gap-1 text-sm">
        <span className="text-xs font-medium text-[var(--bt-muted)]">Notes</span>
        <textarea name="notes" rows={2} className="rounded border px-3 py-2 text-sm" style={{ borderColor: "var(--bt-border)" }} />
      </label>

      <p className="text-xs text-[var(--bt-muted)]">Save only. Review links are issued from the detail page (token returned, not emailed).</p>

      {state.error ? (
        <p role="alert" className="text-xs text-red-600">
          {state.error}
        </p>
      ) : null}

      <button type="submit" disabled={pending} className="self-end rounded px-4 py-2 text-sm font-semibold text-[var(--bt-on-primary)] disabled:opacity-50" style={{ background: "var(--bt-primary)" }}>
        {pending ? "Saving…" : "Save"}
      </button>
    </form>
  );
}
