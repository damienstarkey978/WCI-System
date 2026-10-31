"use client";

import { useActionState } from "react";

import { createPermitPackageAction, type ActionState } from "./actions";

const INITIAL: ActionState = {};

export function CreatePackageForm({
  jobId,
  defaultAddress,
  buildingPermitId,
  licenses,
}: {
  jobId: string;
  defaultAddress: string;
  buildingPermitId: string | null;
  licenses: readonly { id: string; qualifierName: string; licenseNumber: string }[];
}) {
  const [state, action, pending] = useActionState(createPermitPackageAction, INITIAL);

  return (
    <form action={action} className="grid gap-2 text-sm">
      <input type="hidden" name="jobId" value={jobId} />
      {buildingPermitId ? <input type="hidden" name="jobPermitId" value={buildingPermitId} /> : null}
      <input type="hidden" name="county" value="DUVAL" />
      <input type="hidden" name="municipality" value="JACKSONVILLE" />
      <input type="hidden" name="permitType" value="BUILDING" />
      <input type="hidden" name="formKeys" value="noc" />
      <input type="hidden" name="formKeys" value="permission_by_owner" />
      <input type="hidden" name="formKeys" value="pais" />

      <label className="grid gap-1">
        <span className="text-xs font-medium text-[var(--bt-muted)]">Package / project name</span>
        <input
          name="name"
          required
          defaultValue="Test package (batch 1) — do not submit"
          className="rounded border px-3 py-2 text-sm"
          style={{ borderColor: "var(--bt-border)" }}
        />
      </label>
      <label className="grid gap-1">
        <span className="text-xs font-medium text-[var(--bt-muted)]">Property address</span>
        <input
          name="propertyAddress"
          defaultValue={defaultAddress}
          className="rounded border px-3 py-2 text-sm"
          style={{ borderColor: "var(--bt-border)" }}
        />
      </label>
      {licenses.length > 0 ? (
        <label className="grid gap-1">
          <span className="text-xs font-medium text-[var(--bt-muted)]">Contractor license</span>
          <select
            name="contractorLicenseId"
            defaultValue={licenses[0]?.id}
            className="rounded border px-3 py-2 text-sm"
            style={{ borderColor: "var(--bt-border)" }}
          >
            {licenses.map((l) => (
              <option key={l.id} value={l.id}>
                {l.qualifierName} · {l.licenseNumber}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <p className="text-xs text-[var(--bt-muted)]">
          No org licenses yet — add one under Settings → Permitting.
        </p>
      )}
      <p className="text-xs text-[var(--bt-muted)]">
        Creates a draft with NOC + Permission By Owner + PAIS. Never submits to EPICS/clerk/notary.
      </p>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded px-3 py-2 text-xs font-semibold text-[var(--bt-on-primary)] disabled:opacity-50"
          style={{ background: "var(--bt-primary)" }}
        >
          {pending ? "Creating…" : "Create test package"}
        </button>
        {state.error ? <span className="text-xs text-[var(--bt-hazard)]">{state.error}</span> : null}
        {state.ok ? <span className="text-xs text-emerald-700">Package created.</span> : null}
      </div>
    </form>
  );
}
