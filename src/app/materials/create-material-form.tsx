"use client";

import { useActionState, useRef } from "react";

import { createMaterialCatalogItemAction, type ActionState } from "./actions";

const INITIAL: ActionState = {};

export function CreateMaterialForm() {
  const [state, formAction, pending] = useActionState(createMaterialCatalogItemAction, INITIAL);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      action={async (formData) => {
        await formAction(formData);
        formRef.current?.reset();
      }}
      className="rounded-lg border bg-[var(--bt-panel-bg)] p-4"
      style={{ borderColor: "var(--bt-border)" }}
    >
      <h2 className="text-sm font-semibold text-[var(--bt-text)]">Add material</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-6">
        <label className="grid gap-1 text-sm sm:col-span-2">
          <span className="text-xs font-medium text-[var(--bt-muted)]">Description</span>
          <input name="description" required className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]" style={{ borderColor: "var(--bt-border)" }} />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-xs font-medium text-[var(--bt-muted)]">Vendor</span>
          <select name="vendor" defaultValue="LOWES" className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]" style={{ borderColor: "var(--bt-border)" }}>
            <option value="LOWES">Lowe&apos;s</option>
            <option value="HOME_DEPOT">Home Depot</option>
            <option value="OTHER">Other</option>
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-xs font-medium text-[var(--bt-muted)]">SKU</span>
          <input name="sku" className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]" style={{ borderColor: "var(--bt-border)" }} />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-xs font-medium text-[var(--bt-muted)]">Unit</span>
          <input name="unit" required placeholder="SF, LF, EA…" className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]" style={{ borderColor: "var(--bt-border)" }} />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-xs font-medium text-[var(--bt-muted)]">Unit cost</span>
          <input name="unitCost" inputMode="decimal" placeholder="0.00" required className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]" style={{ borderColor: "var(--bt-border)" }} />
        </label>
      </div>
      <label className="mt-3 grid max-w-xs gap-1 text-sm">
        <span className="text-xs font-medium text-[var(--bt-muted)]">Category</span>
        <input name="category" placeholder="Framing, Roofing…" className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]" style={{ borderColor: "var(--bt-border)" }} />
      </label>
      {state.error ? (
        <p role="alert" className="mt-2 text-xs text-red-600">
          {state.error}
        </p>
      ) : null}
      <div className="mt-3">
        <button type="submit" disabled={pending} className="rounded px-4 py-2 text-sm font-semibold text-[var(--bt-on-primary)] disabled:opacity-50" style={{ background: "var(--bt-primary)" }}>
          {pending ? "Adding…" : "Add material"}
        </button>
      </div>
    </form>
  );
}
