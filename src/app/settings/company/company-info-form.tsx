"use client";

import { useActionState } from "react";

import { updateCompanyInfoAction, type ActionState } from "./actions";

const INITIAL: ActionState = {};

export interface CompanyInfo {
  readonly name: string;
  readonly logoPath: string | null;
  readonly addressLine1: string | null;
  readonly city: string | null;
  readonly state: string | null;
  readonly postalCode: string | null;
  readonly contactEmail: string | null;
  readonly contactPhone: string | null;
}

function Field({ label, name, defaultValue, placeholder }: { label: string; name: string; defaultValue: string; placeholder?: string }) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="text-xs font-medium text-[var(--bt-muted)]">{label}</span>
      <input
        name={name}
        defaultValue={defaultValue}
        placeholder={placeholder}
        className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]"
        style={{ borderColor: "var(--bt-border)" }}
      />
    </label>
  );
}

export function CompanyInfoForm({ info }: { info: CompanyInfo }) {
  const [state, formAction, pending] = useActionState(updateCompanyInfoAction, INITIAL);

  return (
    <form action={formAction} className="grid gap-3 sm:grid-cols-2">
      <Field label="Company name" name="name" defaultValue={info.name} />
      <Field label="Logo URL" name="logoPath" defaultValue={info.logoPath ?? ""} placeholder="https://…" />
      <Field label="Contact email" name="contactEmail" defaultValue={info.contactEmail ?? ""} />
      <Field label="Contact phone" name="contactPhone" defaultValue={info.contactPhone ?? ""} />
      <Field label="Address" name="addressLine1" defaultValue={info.addressLine1 ?? ""} />
      <div className="grid grid-cols-3 gap-2">
        <Field label="City" name="city" defaultValue={info.city ?? ""} />
        <Field label="State" name="state" defaultValue={info.state ?? ""} />
        <Field label="ZIP" name="postalCode" defaultValue={info.postalCode ?? ""} />
      </div>

      <div className="sm:col-span-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          style={{ background: "var(--bt-primary)" }}
        >
          {pending ? "Saving…" : "Save"}
        </button>
        {state.error ? (
          <p role="alert" className="mt-2 text-xs text-red-600">
            {state.error}
          </p>
        ) : null}
        {state.ok ? <p className="mt-2 text-xs text-emerald-700">Saved.</p> : null}
      </div>
    </form>
  );
}
