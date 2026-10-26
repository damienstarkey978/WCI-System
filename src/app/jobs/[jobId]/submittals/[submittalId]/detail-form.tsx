"use client";

import { useActionState } from "react";

import { updateSubmittalAction, type ActionState } from "../actions";
import type { UserOption, VendorOption } from "../create-submittal-form";

const INITIAL: ActionState = {};

const TYPES = [
  { value: "MATERIAL_SPEC", label: "Material spec" },
  { value: "SHOP_DRAWING", label: "Shop drawing" },
  { value: "PRODUCT_DATA", label: "Product data" },
  { value: "SAMPLE", label: "Sample" },
  { value: "OTHER", label: "Other" },
] as const;

export function SubmittalDetailForm({
  jobId,
  submittalId,
  numberLabel,
  editable,
  users,
  vendors,
  initial,
}: {
  jobId: string;
  submittalId: string;
  numberLabel: string;
  editable: boolean;
  users: readonly UserOption[];
  vendors: readonly VendorOption[];
  initial: {
    title: string;
    type: string;
    description: string;
    packageName: string;
    division: string;
    specSection: string;
    finalDueDate: string;
    managerUserId: string;
    vendorId: string;
  };
}) {
  const [state, formAction, pending] = useActionState(updateSubmittalAction, INITIAL);

  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-lg border bg-[var(--bt-panel-bg)] p-4" style={{ borderColor: "var(--bt-border)" }}>
      <input type="hidden" name="jobId" value={jobId} />
      <input type="hidden" name="submittalId" value={submittalId} />

      <label className="grid gap-1 text-sm">
        <span className="text-xs font-medium text-[var(--bt-muted)]">Title</span>
        <input
          name="title"
          required
          maxLength={50}
          defaultValue={initial.title}
          disabled={!editable}
          className="rounded border px-3 py-2 text-base font-medium disabled:opacity-60"
          style={{ borderColor: "var(--bt-border)" }}
        />
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm">
          <span className="text-xs font-medium text-[var(--bt-muted)]">#</span>
          <input value={numberLabel} readOnly className="rounded border px-3 py-2 text-sm opacity-80" style={{ borderColor: "var(--bt-border)", background: "var(--bt-bg)" }} />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-xs font-medium text-[var(--bt-muted)]">Submittal type</span>
          <select name="type" defaultValue={initial.type} disabled={!editable} className="rounded border px-3 py-2 text-sm disabled:opacity-60" style={{ borderColor: "var(--bt-border)" }}>
            {TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-xs font-medium text-[var(--bt-muted)]">Package</span>
          <input name="packageName" defaultValue={initial.packageName} disabled={!editable} className="rounded border px-3 py-2 text-sm disabled:opacity-60" style={{ borderColor: "var(--bt-border)" }} />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-xs font-medium text-[var(--bt-muted)]">Division</span>
          <input name="division" defaultValue={initial.division} disabled={!editable} className="rounded border px-3 py-2 text-sm disabled:opacity-60" style={{ borderColor: "var(--bt-border)" }} />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-xs font-medium text-[var(--bt-muted)]">Spec section</span>
          <input name="specSection" defaultValue={initial.specSection} disabled={!editable} className="rounded border px-3 py-2 text-sm disabled:opacity-60" style={{ borderColor: "var(--bt-border)" }} />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-xs font-medium text-[var(--bt-muted)]">Final due date</span>
          <input type="date" name="finalDueDate" defaultValue={initial.finalDueDate} disabled={!editable} className="rounded border px-3 py-2 text-sm disabled:opacity-60" style={{ borderColor: "var(--bt-border)" }} />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-xs font-medium text-[var(--bt-muted)]">Submittal manager</span>
          <select name="managerUserId" defaultValue={initial.managerUserId} disabled={!editable} className="rounded border px-3 py-2 text-sm disabled:opacity-60" style={{ borderColor: "var(--bt-border)" }}>
            <option value="">Unassigned</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name || u.email}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-xs font-medium text-[var(--bt-muted)]">Sub/Trade partner</span>
          <select name="vendorId" defaultValue={initial.vendorId} disabled={!editable} className="rounded border px-3 py-2 text-sm disabled:opacity-60" style={{ borderColor: "var(--bt-border)" }}>
            <option value="">None</option>
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="grid gap-1 text-sm">
        <span className="text-xs font-medium text-[var(--bt-muted)]">Description</span>
        <textarea name="description" rows={4} defaultValue={initial.description} disabled={!editable} className="rounded border px-3 py-2 text-sm disabled:opacity-60" style={{ borderColor: "var(--bt-border)" }} />
      </label>

      {state.error ? <p className="text-xs text-red-600">{state.error}</p> : null}
      {state.ok ? <p className="text-xs text-green-700">Saved.</p> : null}

      {editable ? (
        <button type="submit" disabled={pending} className="self-start rounded border px-4 py-2 text-sm font-semibold disabled:opacity-50" style={{ borderColor: "var(--bt-border)" }}>
          {pending ? "Saving…" : "Save"}
        </button>
      ) : null}
    </form>
  );
}
