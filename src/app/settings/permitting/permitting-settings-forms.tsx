"use client";

import { useActionState, useTransition } from "react";

import { JACKSONVILLE_BUILDING_FORMS } from "@/lib/permitting/form-catalog";

import {
  connectEpicsAction,
  createDesignProAction,
  createFormSetAction,
  createLicenseAction,
  createPaisTemplateAction,
  deleteDesignProAction,
  deleteFormSetAction,
  deleteLicenseAction,
  deletePaisTemplateAction,
  disconnectEpicsAction,
  ensureDefaultLicenseAction,
  saveNocPresetAction,
  type ActionState,
} from "./actions";

const INITIAL: ActionState = {};

function Field({
  label,
  name,
  defaultValue = "",
  placeholder,
  type = "text",
  required,
  autoComplete,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  placeholder?: string;
  type?: string;
  required?: boolean;
  autoComplete?: string;
}) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="text-xs font-medium text-[var(--bt-muted)]">{label}</span>
      <input
        name={name}
        type={type}
        defaultValue={defaultValue}
        placeholder={placeholder}
        required={required}
        autoComplete={autoComplete}
        className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]"
        style={{ borderColor: "var(--bt-border)" }}
      />
    </label>
  );
}

function Status({ state }: { state: ActionState }) {
  if (state.error) return <p className="text-sm text-[var(--bt-hazard)]">{state.error}</p>;
  if (state.ok) return <p className="text-sm text-emerald-700">Saved.</p>;
  return null;
}

export function SeedLicenseButton() {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => start(() => void ensureDefaultLicenseAction())}
      className="rounded px-3 py-1.5 text-xs font-semibold text-[var(--bt-on-primary)] disabled:opacity-50"
      style={{ background: "var(--bt-primary)" }}
    >
      {pending ? "Seeding…" : "Seed WCI CGC1504962"}
    </button>
  );
}

export function LicenseCreateForm() {
  const [state, action, pending] = useActionState(createLicenseAction, INITIAL);
  return (
    <form action={action} className="grid gap-2 sm:grid-cols-2">
      <Field label="Company name" name="companyName" required defaultValue="World Construction CO INC" />
      <Field label="Qualifier name" name="qualifierName" required defaultValue="SIMON P P CREWS" />
      <Field label="License type" name="licenseType" required defaultValue="Certified General Contractor" />
      <Field label="License number" name="licenseNumber" required />
      <Field label="Expires" name="expiresAt" type="date" />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="active" defaultChecked /> Active
      </label>
      <Field label="Address" name="addressLine1" defaultValue="6005 Powers Ave. #210" />
      <Field label="City" name="city" defaultValue="Jacksonville" />
      <Field label="State" name="state" defaultValue="FL" />
      <Field label="ZIP" name="postalCode" defaultValue="32217" />
      <Field label="County" name="county" defaultValue="DUVAL" />
      <Field label="Email" name="email" defaultValue="damien@worldconstructioninc.com" />
      <Field label="Phone" name="phone" defaultValue="904-717-1729" />
      <div className="sm:col-span-2 flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded px-3 py-1.5 text-sm font-semibold text-[var(--bt-on-primary)] disabled:opacity-50"
          style={{ background: "var(--bt-primary)" }}
        >
          {pending ? "Saving…" : "Add license"}
        </button>
        <Status state={state} />
      </div>
    </form>
  );
}

export function LicenseDeleteButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => start(() => void deleteLicenseAction(id))}
      className="text-xs text-[var(--bt-hazard)] hover:underline disabled:opacity-50"
    >
      Remove
    </button>
  );
}

export function NocPresetForm({
  preset,
}: {
  preset: {
    county: string;
    descriptionOfImprovement: string | null;
    ownersInterest: string | null;
    designatedPersonForNotices: string | null;
    lienorsNoticeRecipient: string | null;
    expirationRule: string | null;
  } | null;
}) {
  const [state, action, pending] = useActionState(saveNocPresetAction, INITIAL);
  return (
    <form action={action} className="grid gap-2">
      <input type="hidden" name="county" value={preset?.county ?? "DUVAL"} />
      <label className="grid gap-1 text-sm">
        <span className="text-xs font-medium text-[var(--bt-muted)]">Description of Improvement</span>
        <textarea
          name="descriptionOfImprovement"
          rows={3}
          defaultValue={preset?.descriptionOfImprovement ?? ""}
          className="rounded border px-3 py-2 text-sm"
          style={{ borderColor: "var(--bt-border)" }}
        />
      </label>
      <Field label="Owner's Interest" name="ownersInterest" defaultValue={preset?.ownersInterest ?? "Fee Simple"} />
      <Field
        label="Designated person for notices"
        name="designatedPersonForNotices"
        defaultValue={preset?.designatedPersonForNotices ?? ""}
      />
      <Field
        label="Lienor's Notice recipient"
        name="lienorsNoticeRecipient"
        defaultValue={preset?.lienorsNoticeRecipient ?? ""}
      />
      <Field
        label="Expiration rule"
        name="expirationRule"
        defaultValue={preset?.expirationRule ?? "1 year after recording"}
      />
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded px-3 py-1.5 text-sm font-semibold text-[var(--bt-on-primary)] disabled:opacity-50"
          style={{ background: "var(--bt-primary)" }}
        >
          {pending ? "Saving…" : "Save Duval NOC preset"}
        </button>
        <Status state={state} />
      </div>
    </form>
  );
}

export function DesignProCreateForm() {
  const [state, action, pending] = useActionState(createDesignProAction, INITIAL);
  return (
    <form action={action} className="grid gap-2 sm:grid-cols-2">
      <label className="grid gap-1 text-sm">
        <span className="text-xs font-medium text-[var(--bt-muted)]">Kind</span>
        <select name="kind" defaultValue="ENGINEER" className="rounded border px-3 py-2 text-sm" style={{ borderColor: "var(--bt-border)" }}>
          <option value="ARCHITECT">Architect</option>
          <option value="ENGINEER">Engineer</option>
          <option value="OTHER">Other</option>
        </select>
      </label>
      <Field label="Name" name="name" required />
      <Field label="Firm" name="firm" />
      <Field label="License #" name="licenseNumber" />
      <Field label="Address" name="addressLine1" />
      <Field label="City" name="city" />
      <Field label="State" name="state" />
      <Field label="ZIP" name="postalCode" />
      <Field label="Phone" name="phone" />
      <Field label="Email" name="email" />
      <div className="sm:col-span-2 flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded px-3 py-1.5 text-sm font-semibold text-[var(--bt-on-primary)] disabled:opacity-50"
          style={{ background: "var(--bt-primary)" }}
        >
          {pending ? "Saving…" : "Add design professional"}
        </button>
        <Status state={state} />
      </div>
    </form>
  );
}

export function DesignProDeleteButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => start(() => void deleteDesignProAction(id))}
      className="text-xs text-[var(--bt-hazard)] hover:underline"
    >
      Remove
    </button>
  );
}

export function FormSetCreateForm() {
  const [state, action, pending] = useActionState(createFormSetAction, INITIAL);
  return (
    <form action={action} className="grid gap-2">
      <Field label="Template name" name="name" required placeholder="Roof / Siding" />
      <Field label="County" name="county" defaultValue="DUVAL" />
      <Field label="Municipality" name="municipality" placeholder="JACKSONVILLE" />
      <label className="grid gap-1 text-sm">
        <span className="text-xs font-medium text-[var(--bt-muted)]">Permit type</span>
        <select name="permitType" defaultValue="BUILDING" className="rounded border px-3 py-2 text-sm" style={{ borderColor: "var(--bt-border)" }}>
          <option value="BUILDING">Building</option>
          <option value="ELECTRICAL">Electrical</option>
          <option value="FIRE">Fire</option>
          <option value="MECHANICAL">Mechanical</option>
        </select>
      </label>
      <fieldset className="grid gap-1">
        <legend className="text-xs font-medium text-[var(--bt-muted)]">Forms</legend>
        <div className="max-h-48 overflow-auto rounded border p-2 text-xs" style={{ borderColor: "var(--bt-border)" }}>
          {JACKSONVILLE_BUILDING_FORMS.map((f) => (
            <label key={f.key} className="flex items-start gap-2 py-0.5">
              <input type="checkbox" name="formKeys" value={f.key} defaultChecked={f.preselected} />
              <span>{f.title}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded px-3 py-1.5 text-sm font-semibold text-[var(--bt-on-primary)] disabled:opacity-50"
          style={{ background: "var(--bt-primary)" }}
        >
          {pending ? "Saving…" : "Add form-set template"}
        </button>
        <Status state={state} />
      </div>
    </form>
  );
}

export function FormSetDeleteButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <button type="button" disabled={pending} onClick={() => start(() => void deleteFormSetAction(id))} className="text-xs text-[var(--bt-hazard)] hover:underline">
      Remove
    </button>
  );
}

export function PaisTemplateCreateForm() {
  const [state, action, pending] = useActionState(createPaisTemplateAction, INITIAL);
  return (
    <form action={action} className="grid gap-2 sm:grid-cols-2">
      <Field label="Template name" name="name" required />
      <Field label="Manufacturer" name="manufacturer" />
      <Field label="Model" name="model" />
      <Field label="Approval #" name="approvalNumber" />
      <Field label="Category" name="category" />
      <Field label="Notes" name="notes" />
      <div className="sm:col-span-2 flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded px-3 py-1.5 text-sm font-semibold text-[var(--bt-on-primary)] disabled:opacity-50"
          style={{ background: "var(--bt-primary)" }}
        >
          {pending ? "Saving…" : "Add PAIS product template"}
        </button>
        <Status state={state} />
      </div>
    </form>
  );
}

export function PaisTemplateDeleteButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <button type="button" disabled={pending} onClick={() => start(() => void deletePaisTemplateAction(id))} className="text-xs text-[var(--bt-hazard)] hover:underline">
      Remove
    </button>
  );
}

export function EpicsConnectForm({ connected, username }: { connected: boolean; username?: string | null }) {
  const [state, action, pending] = useActionState(connectEpicsAction, INITIAL);
  const [discPending, startDisc] = useTransition();
  return (
    <div className="grid gap-3">
      <p className="text-sm text-[var(--bt-muted)]">
        Store JAX EPICS credentials encrypted at rest. Connecting does <strong>not</strong> submit any package —
        city automation is an explicit staff click per package (batch 5).
      </p>
      <p className="text-sm">
        Status:{" "}
        {connected ? (
          <span className="font-semibold text-emerald-700">Connected{username ? ` as ${username}` : ""}</span>
        ) : (
          <span className="text-[var(--bt-muted)]">Not connected</span>
        )}
      </p>
      <form action={action} className="grid gap-2 sm:grid-cols-2">
        <Field label="Username" name="username" required autoComplete="off" />
        <Field label="Password" name="password" type="password" required autoComplete="new-password" />
        <div className="sm:col-span-2 flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={pending}
            className="rounded px-3 py-1.5 text-sm font-semibold text-[var(--bt-on-primary)] disabled:opacity-50"
            style={{ background: "var(--bt-primary)" }}
          >
            {pending ? "Saving…" : connected ? "Update credentials" : "Connect EPICS"}
          </button>
          {connected ? (
            <button
              type="button"
              disabled={discPending}
              onClick={() => startDisc(() => void disconnectEpicsAction())}
              className="rounded border px-3 py-1.5 text-sm disabled:opacity-50"
              style={{ borderColor: "var(--bt-border)" }}
            >
              Disconnect
            </button>
          ) : null}
          <Status state={state} />
        </div>
      </form>
    </div>
  );
}
