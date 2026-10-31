"use client";

import { useActionState, useMemo, useState } from "react";

import {
  DUVAL_MUNICIPALITIES,
  formsForCatalog,
  type PermitCatalogMunicipality,
  type PermitCatalogPermitType,
} from "@/lib/permitting/form-catalog";

import { createPermitPackageAction, type ActionState } from "./actions";

const INITIAL: ActionState = {};

const PERMIT_TYPES: readonly { value: PermitCatalogPermitType; label: string }[] = [
  { value: "BUILDING", label: "Building" },
  { value: "ELECTRICAL", label: "Electrical" },
  { value: "FIRE", label: "Fire" },
  { value: "MECHANICAL", label: "Mechanical" },
  { value: "PLUMBING", label: "Plumbing" },
  { value: "ROOFING", label: "Roofing" },
];

type LicenseOption = { id: string; qualifierName: string; licenseNumber: string };

type AvailableFormMeta = {
  key: string;
  title: string;
  available: boolean;
  revisionDate: string | null;
};

export function CreatePackageForm({
  jobId,
  defaultAddress,
  defaultPackageName,
  buildingPermitId,
  licenses,
  formAvailability,
}: {
  jobId: string;
  defaultAddress: string;
  defaultPackageName: string;
  buildingPermitId: string | null;
  licenses: readonly LicenseOption[];
  formAvailability: readonly AvailableFormMeta[];
}) {
  const [state, action, pending] = useActionState(createPermitPackageAction, INITIAL);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [municipality, setMunicipality] = useState<PermitCatalogMunicipality>("JACKSONVILLE");
  const [permitType, setPermitType] = useState<PermitCatalogPermitType>("BUILDING");
  const [propertyAddress, setPropertyAddress] = useState(defaultAddress);
  const catalog = useMemo(
    () => formsForCatalog({ county: "DUVAL", municipality, permitType }),
    [municipality, permitType],
  );
  const availabilityByKey = useMemo(() => {
    const map = new Map(formAvailability.map((f) => [f.key, f]));
    return map;
  }, [formAvailability]);

  const [selected, setSelected] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    for (const f of formsForCatalog({
      county: "DUVAL",
      municipality: "JACKSONVILLE",
      permitType: "BUILDING",
    })) {
      if (f.preselected) initial.add(f.key);
    }
    // Batch-2 default trio when Jacksonville building (matches live Rockstar sample).
    initial.add("permission_by_owner");
    initial.add("pais");
    return initial;
  });

  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(catalog.map((f) => f.key)));
  }

  function unselectAll() {
    setSelected(new Set());
  }

  const selectedCount = catalog.filter((f) => selected.has(f.key)).length;

  return (
    <form action={action} className="grid gap-3 text-sm">
      <input type="hidden" name="jobId" value={jobId} />
      {buildingPermitId ? <input type="hidden" name="jobPermitId" value={buildingPermitId} /> : null}
      <input type="hidden" name="county" value="DUVAL" />
      <input type="hidden" name="municipality" value={municipality} />
      <input type="hidden" name="permitType" value={permitType} />
      <input type="hidden" name="propertyAddress" value={propertyAddress} />
      {[...selected].map((key) => (
        <input key={key} type="hidden" name="formKeys" value={key} />
      ))}

      <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--bt-muted)]">
        <span className={step === 1 ? "font-semibold text-[var(--bt-text)]" : ""}>1. Location</span>
        <span aria-hidden>→</span>
        <span className={step === 2 ? "font-semibold text-[var(--bt-text)]" : ""}>
          2. Forms ({selectedCount}/{catalog.length})
        </span>
        <span aria-hidden>→</span>
        <span className={step === 3 ? "font-semibold text-[var(--bt-text)]" : ""}>3. Package</span>
      </div>

      {step === 1 ? (
        <div className="grid gap-2">
          <label className="grid gap-1">
            <span className="text-xs font-medium text-[var(--bt-muted)]">County</span>
            <input
              value="Duval"
              disabled
              className="rounded border px-3 py-2 text-sm opacity-80"
              style={{ borderColor: "var(--bt-border)" }}
            />
          </label>
          <label className="grid gap-1">
            <span className="text-xs font-medium text-[var(--bt-muted)]">Municipality</span>
            <select
              value={municipality}
              onChange={(e) => {
                const next = e.target.value as PermitCatalogMunicipality;
                setMunicipality(next);
                const nextCatalog = formsForCatalog({
                  county: "DUVAL",
                  municipality: next,
                  permitType,
                });
                setSelected(new Set(nextCatalog.filter((f) => f.preselected).map((f) => f.key)));
              }}
              className="rounded border px-3 py-2 text-sm"
              style={{ borderColor: "var(--bt-border)" }}
            >
              {DUVAL_MUNICIPALITIES.map((m) => (
                <option key={m.key} value={m.key}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1">
            <span className="text-xs font-medium text-[var(--bt-muted)]">Permit type</span>
            <select
              value={permitType}
              onChange={(e) => {
                const next = e.target.value as PermitCatalogPermitType;
                setPermitType(next);
                const nextCatalog = formsForCatalog({
                  county: "DUVAL",
                  municipality,
                  permitType: next,
                });
                setSelected(new Set(nextCatalog.filter((f) => f.preselected).map((f) => f.key)));
              }}
              className="rounded border px-3 py-2 text-sm"
              style={{ borderColor: "var(--bt-border)" }}
            >
              {PERMIT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1">
            <span className="text-xs font-medium text-[var(--bt-muted)]">Property address</span>
            <input
              value={propertyAddress}
              onChange={(e) => setPropertyAddress(e.target.value)}
              className="rounded border px-3 py-2 text-sm"
              style={{ borderColor: "var(--bt-border)" }}
            />
          </label>
          <button
            type="button"
            onClick={() => setStep(2)}
            className="mt-1 w-fit rounded px-3 py-2 text-xs font-semibold text-[var(--bt-on-primary)]"
            style={{ background: "var(--bt-primary)" }}
          >
            Continue to forms
          </button>
        </div>
      ) : null}

      {step === 2 ? (
        <div className="grid gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={selectAll}
              className="text-xs text-[var(--bt-primary)] hover:underline"
            >
              Select all
            </button>
            <button
              type="button"
              onClick={unselectAll}
              className="text-xs text-[var(--bt-primary)] hover:underline"
            >
              Unselect all
            </button>
            <span className="text-xs text-[var(--bt-muted)]">
              Selected {selectedCount}/{catalog.length}
            </span>
          </div>
          <ul className="grid max-h-64 gap-1 overflow-y-auto rounded border p-2" style={{ borderColor: "var(--bt-border)" }}>
            {catalog.map((f) => {
              const meta = availabilityByKey.get(f.key);
              const available = meta?.available ?? false;
              return (
                <li key={f.key}>
                  <label className="flex cursor-pointer items-start gap-2 rounded px-1 py-1 hover:bg-[color-mix(in_srgb,var(--bt-border)_35%,transparent)]">
                    <input
                      type="checkbox"
                      checked={selected.has(f.key)}
                      onChange={() => toggle(f.key)}
                      className="mt-0.5"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm text-[var(--bt-text)]">{f.title}</span>
                      <span className="block text-[10px] text-[var(--bt-muted)]">
                        {available
                          ? `Official PDF · rev ${meta?.revisionDate ?? "—"}`
                          : "PDF not sourced yet — package row only"}
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="rounded border px-3 py-2 text-xs font-semibold"
              style={{ borderColor: "var(--bt-border)" }}
            >
              Back
            </button>
            <button
              type="button"
              disabled={selectedCount === 0}
              onClick={() => setStep(3)}
              className="rounded px-3 py-2 text-xs font-semibold text-[var(--bt-on-primary)] disabled:opacity-50"
              style={{ background: "var(--bt-primary)" }}
            >
              Continue
            </button>
          </div>
        </div>
      ) : null}

      {step === 3 ? (
        <div className="grid gap-2">
          <label className="grid gap-1">
            <span className="text-xs font-medium text-[var(--bt-muted)]">Package / project name</span>
            <input
              name="name"
              required
              defaultValue={defaultPackageName}
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

          <fieldset className="grid gap-2 rounded border p-2" style={{ borderColor: "var(--bt-border)" }}>
            <legend className="px-1 text-xs font-medium text-[var(--bt-muted)]">
              Owner / improvement (fills NOC + Owner Auth)
            </legend>
            <label className="grid gap-1">
              <span className="text-[10px] text-[var(--bt-muted)]">Owner name</span>
              <input name="ownerName" className="rounded border px-2 py-1.5 text-sm" style={{ borderColor: "var(--bt-border)" }} />
            </label>
            <label className="grid gap-1">
              <span className="text-[10px] text-[var(--bt-muted)]">Owner mailing address</span>
              <input name="ownerMailingAddress" className="rounded border px-2 py-1.5 text-sm" style={{ borderColor: "var(--bt-border)" }} />
            </label>
            <label className="grid gap-1">
              <span className="text-[10px] text-[var(--bt-muted)]">Owner city / state / zip</span>
              <input name="ownerCityStateZip" className="rounded border px-2 py-1.5 text-sm" style={{ borderColor: "var(--bt-border)" }} />
            </label>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="grid gap-1">
                <span className="text-[10px] text-[var(--bt-muted)]">Owner phone</span>
                <input name="ownerPhone" className="rounded border px-2 py-1.5 text-sm" style={{ borderColor: "var(--bt-border)" }} />
              </label>
              <label className="grid gap-1">
                <span className="text-[10px] text-[var(--bt-muted)]">Owner email</span>
                <input name="ownerEmail" type="email" className="rounded border px-2 py-1.5 text-sm" style={{ borderColor: "var(--bt-border)" }} />
              </label>
            </div>
            <label className="grid gap-1">
              <span className="text-[10px] text-[var(--bt-muted)]">Description of improvement / work</span>
              <textarea
                name="descriptionOfImprovement"
                rows={2}
                className="rounded border px-2 py-1.5 text-sm"
                style={{ borderColor: "var(--bt-border)" }}
              />
            </label>
            <label className="grid gap-1">
              <span className="text-[10px] text-[var(--bt-muted)]">Owner&apos;s interest (default Fee Simple)</span>
              <input
                name="ownersInterest"
                defaultValue="Fee Simple"
                className="rounded border px-2 py-1.5 text-sm"
                style={{ borderColor: "var(--bt-border)" }}
              />
            </label>
            <label className="grid gap-1">
              <span className="text-[10px] text-[var(--bt-muted)]">Legal description / lot</span>
              <input name="legalDescription" className="rounded border px-2 py-1.5 text-sm" style={{ borderColor: "var(--bt-border)" }} />
            </label>
            <label className="grid gap-1">
              <span className="text-[10px] text-[var(--bt-muted)]">Tax folio #</span>
              <input name="taxFolio" className="rounded border px-2 py-1.5 text-sm" style={{ borderColor: "var(--bt-border)" }} />
            </label>
          </fieldset>

          <label className="flex items-center gap-2 text-xs text-[var(--bt-muted)]">
            <input type="checkbox" name="automateWithCity" value="true" disabled />
            Automate with City of Jacksonville (EPICS) — connect credentials first; never auto-submits
          </label>

          <p className="text-xs text-[var(--bt-muted)]">
            Creates the package and fills sourced official PDFs (NOC / Owner Authorization / PAIS when
            selected). Never submits to EPICS, clerk, or notary.
          </p>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setStep(2)}
              className="rounded border px-3 py-2 text-xs font-semibold"
              style={{ borderColor: "var(--bt-border)" }}
            >
              Back
            </button>
            <button
              type="submit"
              disabled={pending || selectedCount === 0}
              className="rounded px-3 py-2 text-xs font-semibold text-[var(--bt-on-primary)] disabled:opacity-50"
              style={{ background: "var(--bt-primary)" }}
            >
              {pending ? "Creating…" : "Create permit package"}
            </button>
            {state.error ? <span className="text-xs text-[var(--bt-hazard)]">{state.error}</span> : null}
            {state.ok ? <span className="text-xs text-emerald-700">Package created.</span> : null}
          </div>
        </div>
      ) : null}
    </form>
  );
}
