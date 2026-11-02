"use client";

import { useActionState, useMemo, useState } from "react";

import {
  DUVAL_MUNICIPALITIES,
  formsForCatalog,
  type PermitCatalogMunicipality,
  type PermitCatalogPermitType,
} from "@/lib/permitting/form-catalog";

import { AddressLockStep, type LockedParcelFields } from "./address-lock-step";
import { createPermitPackageAction, type ActionState } from "./actions";
import { PackageWizardShell } from "./package-wizard-shell";

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
  wciGenerated?: boolean;
};

type FormSetTemplateOption = {
  id: string;
  name: string;
  county: string;
  municipality: string | null;
  permitType: string;
  formKeys: readonly string[];
};

type InitialParcelLock = LockedParcelFields | null;

type WizardStep = "A" | "B" | "C";

const STEP_META: Record<WizardStep, { label: string; short: string }> = {
  A: { label: "A · Address & location", short: "A" },
  B: { label: "B · Forms & templates", short: "B" },
  C: { label: "C · Package & license", short: "C" },
};

export function CreatePackageForm({
  jobId,
  defaultAddress,
  defaultPackageName,
  buildingPermitId,
  licenses,
  formAvailability,
  blankPdfUrls,
  formSetTemplates = [],
  initialParcelLock = null,
}: {
  jobId: string;
  defaultAddress: string;
  defaultPackageName: string;
  buildingPermitId: string | null;
  licenses: readonly LicenseOption[];
  formAvailability: readonly AvailableFormMeta[];
  blankPdfUrls: Readonly<Record<string, string>>;
  formSetTemplates?: readonly FormSetTemplateOption[];
  initialParcelLock?: InitialParcelLock;
}) {
  const [state, action, pending] = useActionState(createPermitPackageAction, INITIAL);
  const [step, setStep] = useState<WizardStep>("A");
  const [municipality, setMunicipality] = useState<PermitCatalogMunicipality>("JACKSONVILLE");
  const [permitType, setPermitType] = useState<PermitCatalogPermitType>("BUILDING");
  const [propertyAddress, setPropertyAddress] = useState(
    initialParcelLock?.propertyAddress || defaultAddress,
  );
  const [parcelLock, setParcelLock] = useState<LockedParcelFields | null>(initialParcelLock);
  const [previewFormKey, setPreviewFormKey] = useState<string | null>("noc");
  const [templatesOpen, setTemplatesOpen] = useState(false);

  const catalog = useMemo(
    () => formsForCatalog({ county: "DUVAL", municipality, permitType }),
    [municipality, permitType],
  );
  const availabilityByKey = useMemo(() => {
    const map = new Map(formAvailability.map((f) => [f.key, f]));
    return map;
  }, [formAvailability]);

  const matchingTemplates = useMemo(
    () =>
      formSetTemplates.filter(
        (t) =>
          t.county.toUpperCase() === "DUVAL" &&
          t.permitType === permitType &&
          (!t.municipality || t.municipality === municipality),
      ),
    [formSetTemplates, municipality, permitType],
  );

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
    setPreviewFormKey(key);
  }

  function selectAll() {
    setSelected(new Set(catalog.map((f) => f.key)));
  }

  function unselectAll() {
    setSelected(new Set());
  }

  function applyTemplate(tpl: FormSetTemplateOption) {
    const catalogKeys = new Set(catalog.map((f) => f.key));
    const next = new Set(tpl.formKeys.filter((k) => catalogKeys.has(k)));
    if (next.size === 0) {
      for (const f of catalog) {
        if (f.preselected) next.add(f.key);
      }
    }
    setSelected(next);
    const firstPreview =
      [...next].find((k) => blankPdfUrls[k]) ?? [...next][0] ?? catalog[0]?.key ?? null;
    setPreviewFormKey(firstPreview);
    setTemplatesOpen(false);
  }

  const selectedCount = catalog.filter((f) => selected.has(f.key)).length;

  const previewKey =
    previewFormKey && (selected.has(previewFormKey) || step !== "B")
      ? previewFormKey
      : ([...selected].find((k) => blankPdfUrls[k]) ?? [...selected][0] ?? "noc");
  const previewMeta = availabilityByKey.get(previewKey);
  const previewTitle = catalog.find((f) => f.key === previewKey)?.title ?? previewMeta?.title ?? "Form";
  const previewUrl = blankPdfUrls[previewKey] ?? null;

  return (
    <PackageWizardShell
      title="Create permit package"
      subtitle="Steps A–C create the package · Step D (per-form 1/N) opens after create in the package panel"
      previewTitle={previewTitle}
      previewUrl={previewUrl}
      previewEmptyHint={
        previewMeta?.wciGenerated
          ? "Scope of Values is WCI-generated (Batch 8) — no city blank to preview yet."
          : "Select a sourced official form to preview the blank PDF."
      }
    >
      <form action={action} className="grid gap-3 text-sm">
        <input type="hidden" name="jobId" value={jobId} />
        {buildingPermitId ? (
          <input type="hidden" name="jobPermitId" value={buildingPermitId} />
        ) : null}
        <input type="hidden" name="county" value="DUVAL" />
        <input type="hidden" name="municipality" value={municipality} />
        <input type="hidden" name="permitType" value={permitType} />
        <input type="hidden" name="propertyAddress" value={propertyAddress} />
        {[...selected].map((key) => (
          <input key={key} type="hidden" name="formKeys" value={key} />
        ))}

        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-[var(--bt-muted)]">
          {(Object.keys(STEP_META) as WizardStep[]).map((key, i) => (
            <span key={key} className="inline-flex items-center gap-1.5">
              {i > 0 ? <span aria-hidden>→</span> : null}
              <span className={step === key ? "font-semibold text-[var(--bt-text)]" : ""}>
                {STEP_META[key].label}
              </span>
            </span>
          ))}
          <span aria-hidden>→</span>
          <span className="text-[var(--bt-muted)]">D · Form entry 1/N</span>
        </div>

        {step === "A" ? (
          <div className="grid gap-3">
            <AddressLockStep
              jobId={jobId}
              defaultAddress={defaultAddress}
              initialLocked={parcelLock}
              onLocked={(fields) => {
                setParcelLock(fields);
                setPropertyAddress(fields.propertyAddress);
              }}
              onUnlock={() => setParcelLock(null)}
            />
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
            <button
              type="button"
              disabled={!parcelLock}
              onClick={() => setStep("B")}
              className="mt-1 w-fit rounded px-3 py-2 text-xs font-semibold text-[var(--bt-on-primary)] disabled:opacity-50"
              style={{ background: "var(--bt-primary)" }}
            >
              Continue to forms
            </button>
            {!parcelLock ? (
              <p className="text-[10px] text-[var(--bt-muted)]">
                Confirm a Duval parcel above before continuing (address lock → PAO/GIS → forms).
              </p>
            ) : null}
          </div>
        ) : null}

        {step === "B" ? (
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
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setTemplatesOpen((o) => !o)}
                  className="rounded border px-2 py-1 text-xs font-semibold"
                  style={{ borderColor: "var(--bt-border)" }}
                  aria-expanded={templatesOpen}
                >
                  Templates
                </button>
                {templatesOpen ? (
                  <div
                    className="absolute left-0 z-10 mt-1 min-w-[14rem] rounded border bg-[var(--bt-panel-bg)] p-1 shadow-sm"
                    style={{ borderColor: "var(--bt-border)" }}
                  >
                    {matchingTemplates.length === 0 ? (
                      <p className="px-2 py-1.5 text-[11px] text-[var(--bt-muted)]">
                        No form-set templates for this municipality / type. Add under Settings →
                        Permitting.
                      </p>
                    ) : (
                      matchingTemplates.map((tpl) => (
                        <button
                          key={tpl.id}
                          type="button"
                          onClick={() => applyTemplate(tpl)}
                          className="block w-full rounded px-2 py-1.5 text-left text-xs hover:bg-[color-mix(in_srgb,var(--bt-border)_40%,transparent)]"
                        >
                          <span className="font-medium text-[var(--bt-text)]">{tpl.name}</span>
                          <span className="mt-0.5 block text-[10px] text-[var(--bt-muted)]">
                            {tpl.formKeys.length} form{tpl.formKeys.length === 1 ? "" : "s"}
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                ) : null}
              </div>
              <span className="text-xs text-[var(--bt-muted)]">
                Selected {selectedCount}/{catalog.length}
              </span>
            </div>
            <ul
              className="grid max-h-64 gap-1 overflow-y-auto rounded border p-2"
              style={{ borderColor: "var(--bt-border)" }}
            >
              {catalog.map((f) => {
                const meta = availabilityByKey.get(f.key);
                const available = meta?.available ?? false;
                const isPreview = previewKey === f.key;
                return (
                  <li key={f.key}>
                    <label
                      className="flex cursor-pointer items-start gap-2 rounded px-1 py-1 hover:bg-[color-mix(in_srgb,var(--bt-border)_35%,transparent)]"
                      style={
                        isPreview
                          ? {
                              background:
                                "color-mix(in srgb, var(--bt-primary) 8%, transparent)",
                            }
                          : undefined
                      }
                    >
                      <input
                        type="checkbox"
                        checked={selected.has(f.key)}
                        onChange={() => toggle(f.key)}
                        onFocus={() => setPreviewFormKey(f.key)}
                        className="mt-0.5"
                      />
                      <button
                        type="button"
                        className="min-w-0 flex-1 text-left"
                        onClick={() => setPreviewFormKey(f.key)}
                      >
                        <span className="block text-sm text-[var(--bt-text)]">{f.title}</span>
                        <span className="block text-[10px] text-[var(--bt-muted)]">
                          {meta?.wciGenerated
                            ? "WCI-generated PDF (Batch 8) — selectable now, fill later"
                            : available
                              ? `Official PDF · rev ${meta?.revisionDate ?? "—"}`
                              : "PDF not sourced yet — package row only"}
                        </span>
                      </button>
                    </label>
                  </li>
                );
              })}
            </ul>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setStep("A")}
                className="rounded border px-3 py-2 text-xs font-semibold"
                style={{ borderColor: "var(--bt-border)" }}
              >
                Back
              </button>
              <button
                type="button"
                disabled={selectedCount === 0}
                onClick={() => setStep("C")}
                className="rounded px-3 py-2 text-xs font-semibold text-[var(--bt-on-primary)] disabled:opacity-50"
                style={{ background: "var(--bt-primary)" }}
              >
                Continue
              </button>
            </div>
          </div>
        ) : null}

        {step === "C" ? (
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

            <fieldset
              className="grid gap-2 rounded border p-2"
              style={{ borderColor: "var(--bt-border)" }}
            >
              <legend className="px-1 text-xs font-medium text-[var(--bt-muted)]">
                Owner / improvement (fills NOC + Owner Auth)
              </legend>
              <label className="grid gap-1">
                <span className="text-[10px] text-[var(--bt-muted)]">Owner name</span>
                <input
                  name="ownerName"
                  defaultValue={parcelLock?.ownerName ?? ""}
                  key={`ownerName-${parcelLock?.taxFolio ?? "none"}`}
                  className="rounded border px-2 py-1.5 text-sm"
                  style={{ borderColor: "var(--bt-border)" }}
                />
              </label>
              <label className="grid gap-1">
                <span className="text-[10px] text-[var(--bt-muted)]">Owner mailing address</span>
                <input
                  name="ownerMailingAddress"
                  defaultValue={parcelLock?.ownerMailingAddress ?? ""}
                  key={`mail1-${parcelLock?.taxFolio ?? "none"}`}
                  className="rounded border px-2 py-1.5 text-sm"
                  style={{ borderColor: "var(--bt-border)" }}
                />
              </label>
              <label className="grid gap-1">
                <span className="text-[10px] text-[var(--bt-muted)]">Owner city / state / zip</span>
                <input
                  name="ownerCityStateZip"
                  defaultValue={parcelLock?.ownerCityStateZip ?? ""}
                  key={`mail2-${parcelLock?.taxFolio ?? "none"}`}
                  className="rounded border px-2 py-1.5 text-sm"
                  style={{ borderColor: "var(--bt-border)" }}
                />
              </label>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="grid gap-1">
                  <span className="text-[10px] text-[var(--bt-muted)]">Owner phone</span>
                  <input
                    name="ownerPhone"
                    className="rounded border px-2 py-1.5 text-sm"
                    style={{ borderColor: "var(--bt-border)" }}
                  />
                </label>
                <label className="grid gap-1">
                  <span className="text-[10px] text-[var(--bt-muted)]">Owner cell</span>
                  <input
                    name="ownerCellPhone"
                    className="rounded border px-2 py-1.5 text-sm"
                    style={{ borderColor: "var(--bt-border)" }}
                  />
                </label>
                <label className="grid gap-1 sm:col-span-2">
                  <span className="text-[10px] text-[var(--bt-muted)]">Owner email</span>
                  <input
                    name="ownerEmail"
                    type="email"
                    className="rounded border px-2 py-1.5 text-sm"
                    style={{ borderColor: "var(--bt-border)" }}
                  />
                </label>
              </div>
              <label className="grid gap-1">
                <span className="text-[10px] text-[var(--bt-muted)]">
                  Description of improvement (NOC)
                </span>
                <textarea
                  name="descriptionOfImprovement"
                  rows={2}
                  className="rounded border px-2 py-1.5 text-sm"
                  style={{ borderColor: "var(--bt-border)" }}
                />
              </label>
              <label className="grid gap-1">
                <span className="text-[10px] text-[var(--bt-muted)]">
                  Description of work (Permission By Owner)
                </span>
                <textarea
                  name="descriptionOfWork"
                  rows={2}
                  className="rounded border px-2 py-1.5 text-sm"
                  style={{ borderColor: "var(--bt-border)" }}
                />
              </label>
              <fieldset className="grid gap-1.5">
                <legend className="text-[10px] font-medium text-[var(--bt-muted)]">
                  Permission By Owner — review path
                </legend>
                <label className="flex items-start gap-2 text-xs text-[var(--bt-text)]">
                  <input
                    type="radio"
                    name="pboUsesPrivateProvider"
                    value="false"
                    defaultChecked
                    className="mt-0.5"
                  />
                  <span>
                    City Plans Review (default) — checks &quot;Plans Review&quot; / not using private
                    provider
                  </span>
                </label>
                <label className="flex items-start gap-2 text-xs text-[var(--bt-text)]">
                  <input
                    type="radio"
                    name="pboUsesPrivateProvider"
                    value="true"
                    className="mt-0.5"
                  />
                  <span>
                    Private provider — authorizes private provider path (page 2). Staff choice only;
                    never auto-selected from thin air.
                  </span>
                </label>
              </fieldset>
              <label className="grid gap-1">
                <span className="text-[10px] text-[var(--bt-muted)]">
                  Owner&apos;s interest (default Fee Simple)
                </span>
                <input
                  name="ownersInterest"
                  defaultValue="Fee Simple"
                  className="rounded border px-2 py-1.5 text-sm"
                  style={{ borderColor: "var(--bt-border)" }}
                />
              </label>
              <label className="grid gap-1">
                <span className="text-[10px] text-[var(--bt-muted)]">Legal description / lot</span>
                <input
                  name="legalDescription"
                  defaultValue={parcelLock?.legalDescription ?? ""}
                  key={`legal-${parcelLock?.taxFolio ?? "none"}`}
                  className="rounded border px-2 py-1.5 text-sm"
                  style={{ borderColor: "var(--bt-border)" }}
                />
              </label>
              <label className="grid gap-1">
                <span className="text-[10px] text-[var(--bt-muted)]">Tax folio #</span>
                <input
                  name="taxFolio"
                  defaultValue={parcelLock?.taxFolio ?? ""}
                  key={`folio-${parcelLock?.taxFolio ?? "none"}`}
                  className="rounded border px-2 py-1.5 text-sm"
                  style={{ borderColor: "var(--bt-border)" }}
                />
              </label>
            </fieldset>

            <label className="flex items-center gap-2 text-xs text-[var(--bt-muted)]">
              <input type="checkbox" name="automateWithCity" value="true" disabled />
              Automate with City of Jacksonville (EPICS) — connect credentials first; never
              auto-submits
            </label>

            <p className="text-xs text-[var(--bt-muted)]">
              Creates the package and fills sourced official PDFs. Never submits to EPICS, clerk, or
              notary. After create, use Step D in the package panel (form 1/N + live filled preview).
            </p>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setStep("B")}
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
              {state.error ? (
                <span className="text-xs text-[var(--bt-hazard)]">{state.error}</span>
              ) : null}
              {state.ok ? (
                <span className="text-xs text-emerald-700">
                  Package created — open it below for Step D (form 1/N).
                </span>
              ) : null}
            </div>
          </div>
        ) : null}
      </form>
    </PackageWizardShell>
  );
}
