"use client";

import { useActionState, useMemo, useState } from "react";

import { DUVAL_MUNICIPALITIES } from "@/lib/permitting/form-catalog";

import {
  linkPackageJobPermitAction,
  markPackageFormDownloadedAction,
  regeneratePackageFormAction,
  removePermitPackageAction,
  renamePermitPackageAction,
  requestEpicsCityPermitAction,
  setPermitPackageStatusAction,
  updatePermitPackageFieldsAction,
  type ActionState,
} from "./actions";

type PackageTab = "ACTIVE" | "SENT_TO_CONTRACTORS" | "ARCHIVED";
type SidePanel =
  | "property_owner"
  | "contractor"
  | "notarization"
  | "recording"
  | "city_permit"
  | "settings";

type PackageFormRow = {
  id: string;
  formKey: string;
  title: string;
  status: string;
  available: boolean;
};

type PackageRow = {
  id: string;
  name: string;
  status: PackageTab;
  county: string;
  municipality: string | null;
  permitType: string;
  propertyAddress: string | null;
  nocCreated: boolean;
  packageCreated: boolean;
  notarized: boolean;
  recorded: boolean;
  initiatedAt: string | null;
  jobPermitId: string | null;
  jobPermitLabel: string | null;
  forms: readonly PackageFormRow[];
  owner: {
    name: string;
    mailingAddress: string;
    cityStateZip: string;
    phone: string;
    cellPhone: string;
    email: string;
  };
  contractor: {
    companyName: string;
    qualifierName: string;
    licenseNumber: string;
    licenseType: string;
    addressLine: string;
    phone: string;
    email: string;
  } | null;
  epicsRequest: {
    id: string;
    status: string;
    requestedAt: string;
    lastError: string | null;
    resultPermitNumber: string | null;
  } | null;
};

type JobPermitOption = {
  id: string;
  label: string;
};

const INITIAL: ActionState = {};

const TAB_LABELS: Record<PackageTab, string> = {
  ACTIVE: "Active Packages",
  SENT_TO_CONTRACTORS: "Packages Sent to Contractors",
  ARCHIVED: "Archived Packages",
};

const SIDE_TABS: readonly { key: SidePanel; label: string }[] = [
  { key: "property_owner", label: "Property Owner" },
  { key: "contractor", label: "Contractor" },
  { key: "notarization", label: "Notarization" },
  { key: "recording", label: "Recording" },
  { key: "city_permit", label: "City Permit" },
  { key: "settings", label: "Settings" },
];

function municipalityLabel(key: string | null): string {
  if (!key) return "—";
  return DUVAL_MUNICIPALITIES.find((m) => m.key === key)?.label ?? key.replaceAll("_", " ");
}

function Flag({ ok }: { ok: boolean }) {
  return (
    <span
      aria-label={ok ? "Yes" : "No"}
      className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold"
      style={{
        background: ok
          ? "color-mix(in srgb, var(--bt-status-open-bg) 90%, transparent)"
          : "color-mix(in srgb, var(--bt-hazard) 16%, transparent)",
        color: ok ? "var(--bt-status-open-text)" : "var(--bt-hazard)",
      }}
    >
      {ok ? "✓" : "×"}
    </span>
  );
}

function formStatusFlags(status: string) {
  const upper = status.toUpperCase();
  return {
    created: upper !== "DRAFT",
    notarized: upper === "NOTARIZED" || upper === "RECORDED",
    recorded: upper === "RECORDED",
    downloaded: upper === "DOWNLOADED" || upper === "NOTARIZED" || upper === "RECORDED",
  };
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString();
}

export function PackagesPanel({
  jobId,
  packages,
  jobPermits,
  epicsConnected,
}: {
  jobId: string;
  packages: readonly PackageRow[];
  jobPermits: readonly JobPermitOption[];
  /** Org has connected (non-disconnected) JAX EPICS credentials. */
  epicsConnected: boolean;
}) {
  const [tab, setTab] = useState<PackageTab>("ACTIVE");
  const [filter, setFilter] = useState("");
  const [rowsPerPage, setRowsPerPage] = useState(5);
  const [page, setPage] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(packages[0]?.id ?? null);
  const [selectedFormKey, setSelectedFormKey] = useState<string | null>(null);
  const [sidePanel, setSidePanel] = useState<SidePanel>("property_owner");

  const [renameState, renameAction, renamePending] = useActionState(
    renamePermitPackageAction,
    INITIAL,
  );
  const [ownerState, ownerAction, ownerPending] = useActionState(
    updatePermitPackageFieldsAction,
    INITIAL,
  );
  const [linkState, linkAction, linkPending] = useActionState(
    linkPackageJobPermitAction,
    INITIAL,
  );
  const [regenState, regenAction, regenPending] = useActionState(
    regeneratePackageFormAction,
    INITIAL,
  );
  const [epicsState, epicsAction, epicsPending] = useActionState(
    requestEpicsCityPermitAction,
    INITIAL,
  );

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return packages.filter((pkg) => {
      if (pkg.status !== tab) return false;
      if (!q) return true;
      return (
        pkg.name.toLowerCase().includes(q) ||
        (pkg.propertyAddress ?? "").toLowerCase().includes(q) ||
        (pkg.municipality ?? "").toLowerCase().includes(q)
      );
    });
  }, [packages, tab, filter]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / rowsPerPage));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = filtered.slice(safePage * rowsPerPage, safePage * rowsPerPage + rowsPerPage);

  const selected =
    packages.find((p) => p.id === selectedId) ??
    pageRows[0] ??
    filtered[0] ??
    null;

  const activeFormKey =
    selectedFormKey && selected?.forms.some((f) => f.formKey === selectedFormKey)
      ? selectedFormKey
      : (selected?.forms[0]?.formKey ?? null);
  const activeForm = selected?.forms.find((f) => f.formKey === activeFormKey) ?? null;
  const statusFlags = activeForm ? formStatusFlags(activeForm.status) : null;
  const createdForms = selected?.forms.filter((f) => f.status !== "DRAFT").length ?? 0;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={filter}
          onChange={(e) => {
            setFilter(e.target.value);
            setPage(0);
          }}
          placeholder="Filter packages…"
          className="min-w-[10rem] flex-1 rounded border px-2 py-1.5 text-xs"
          style={{ borderColor: "var(--bt-border)", background: "var(--bt-input-bg, transparent)" }}
          aria-label="Filter packages"
        />
        {(Object.keys(TAB_LABELS) as PackageTab[]).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => {
              setTab(key);
              setPage(0);
            }}
            className="rounded px-2.5 py-1.5 text-xs font-semibold"
            style={{
              background: tab === key ? "var(--bt-primary)" : "transparent",
              color: tab === key ? "var(--bt-on-primary)" : "var(--bt-text)",
              border: "1px solid var(--bt-border)",
            }}
          >
            {TAB_LABELS[key]}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded border" style={{ borderColor: "var(--bt-border)" }}>
        <table className="min-w-full text-left text-xs">
          <thead
            className="text-[var(--bt-muted)]"
            style={{ background: "color-mix(in srgb, var(--bt-border) 35%, transparent)" }}
          >
            <tr>
              <th className="px-2 py-2 font-semibold">Package Name</th>
              <th className="px-2 py-2 font-semibold">Project Address</th>
              <th className="px-2 py-2 font-semibold">County</th>
              <th className="px-2 py-2 font-semibold">City</th>
              <th className="px-2 py-2 font-semibold">NOC</th>
              <th className="px-2 py-2 font-semibold">Package</th>
              <th className="px-2 py-2 font-semibold">Notarized</th>
              <th className="px-2 py-2 font-semibold">Recorded</th>
              <th className="px-2 py-2 font-semibold">Initiated</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-2 py-6 text-center text-[var(--bt-muted)]">
                  No packages in this tab.
                </td>
              </tr>
            ) : (
              pageRows.map((pkg) => {
                const selectedRow = selected?.id === pkg.id;
                return (
                  <tr
                    key={pkg.id}
                    className="cursor-pointer border-t"
                    style={{
                      borderColor: "var(--bt-border)",
                      background: selectedRow
                        ? "color-mix(in srgb, var(--bt-primary) 10%, transparent)"
                        : undefined,
                    }}
                    onClick={() => {
                      setSelectedId(pkg.id);
                      setSelectedFormKey(pkg.forms[0]?.formKey ?? null);
                    }}
                  >
                    <td className="px-2 py-2 font-medium text-[var(--bt-text)]">{pkg.name}</td>
                    <td className="px-2 py-2 text-[var(--bt-muted)]">
                      {pkg.propertyAddress || "—"}
                    </td>
                    <td className="px-2 py-2">{pkg.county}</td>
                    <td className="px-2 py-2">{municipalityLabel(pkg.municipality)}</td>
                    <td className="px-2 py-2">
                      <Flag ok={pkg.nocCreated} />
                    </td>
                    <td className="px-2 py-2">
                      <Flag ok={pkg.packageCreated} />
                    </td>
                    <td className="px-2 py-2">
                      <Flag ok={pkg.notarized} />
                    </td>
                    <td className="px-2 py-2">
                      <Flag ok={pkg.recorded} />
                    </td>
                    <td className="px-2 py-2">{formatDate(pkg.initiatedAt)}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[var(--bt-muted)]">
        <label className="inline-flex items-center gap-1">
          Rows per page
          <select
            value={rowsPerPage}
            onChange={(e) => {
              setRowsPerPage(Number(e.target.value));
              setPage(0);
            }}
            className="rounded border px-1 py-0.5"
            style={{ borderColor: "var(--bt-border)" }}
          >
            {[5, 10, 25].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <div className="inline-flex items-center gap-2">
          <span>
            {filtered.length === 0
              ? "0 of 0"
              : `${safePage * rowsPerPage + 1}–${Math.min(
                  (safePage + 1) * rowsPerPage,
                  filtered.length,
                )} of ${filtered.length}`}
          </span>
          <button
            type="button"
            disabled={safePage <= 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            className="rounded border px-2 py-0.5 disabled:opacity-40"
            style={{ borderColor: "var(--bt-border)" }}
          >
            Prev
          </button>
          <button
            type="button"
            disabled={safePage >= pageCount - 1}
            onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
            className="rounded border px-2 py-0.5 disabled:opacity-40"
            style={{ borderColor: "var(--bt-border)" }}
          >
            Next
          </button>
        </div>
      </div>

      {selected ? (
        <div
          className="rounded-lg border bg-[var(--bt-panel-bg)] p-3"
          style={{ borderColor: "var(--bt-border)" }}
          aria-label="Selected permit package"
        >
          <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
            <div>
              <div className="text-sm font-semibold text-[var(--bt-text)]">
                {selected.permitType.replaceAll("_", " ")} Permit
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-3 text-xs">
                <a
                  href={`/jobs/${jobId}/permitting/packages/${selected.id}/pdf`}
                  className="font-semibold text-[var(--bt-primary)] hover:underline"
                >
                  Download Package
                </a>
                <span className="text-[var(--bt-muted)]">
                  Forms {createdForms} / {selected.forms.length}
                </span>
                <span className="text-[var(--bt-muted)]">
                  Permits {selected.jobPermitId ? 1 : 0}
                </span>
              </div>
            </div>
            <form action={linkAction} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="jobId" value={jobId} />
              <input type="hidden" name="packageId" value={selected.id} />
              <label className="text-[10px] text-[var(--bt-muted)]">
                Linked job permit
                <select
                  name="jobPermitId"
                  defaultValue={selected.jobPermitId ?? ""}
                  className="mt-0.5 block rounded border px-2 py-1 text-xs"
                  style={{ borderColor: "var(--bt-border)" }}
                >
                  <option value="">None</option>
                  {jobPermits.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="submit"
                disabled={linkPending}
                className="rounded border px-2 py-1 text-xs font-semibold disabled:opacity-50"
                style={{ borderColor: "var(--bt-border)" }}
              >
                {linkPending ? "Saving…" : "Save link"}
              </button>
              {linkState.error ? (
                <p className="w-full text-[11px] text-[var(--bt-hazard)]">{linkState.error}</p>
              ) : null}
            </form>
          </div>

          <div className="grid gap-3 lg:grid-cols-[minmax(12rem,0.9fr)_minmax(14rem,1.1fr)_minmax(14rem,1.2fr)]">
            <ul className="rounded border" style={{ borderColor: "var(--bt-border)" }}>
              {selected.forms.map((form) => {
                const active = form.formKey === activeFormKey;
                return (
                  <li key={form.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedFormKey(form.formKey)}
                      className="flex w-full items-center gap-2 border-l-2 px-2 py-2 text-left text-xs"
                      style={{
                        borderLeftColor: active ? "var(--bt-primary)" : "transparent",
                        background: active
                          ? "color-mix(in srgb, var(--bt-primary) 8%, transparent)"
                          : undefined,
                      }}
                    >
                      <span
                        aria-hidden
                        className="inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px]"
                        style={{
                          background:
                            form.status === "DRAFT"
                              ? "color-mix(in srgb, var(--bt-border) 55%, transparent)"
                              : "color-mix(in srgb, var(--bt-status-open-bg) 80%, transparent)",
                          color:
                            form.status === "DRAFT" ? "var(--bt-muted)" : "var(--bt-status-open-text)",
                        }}
                      >
                        ✓
                      </span>
                      <span className="min-w-0">
                        <span className="block font-medium text-[var(--bt-text)]">{form.title}</span>
                        <span className="text-[10px] text-[var(--bt-muted)]">
                          {form.status.replaceAll("_", " ")}
                          {form.available ? "" : " · PDF unavailable"}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>

            <div className="rounded border p-3" style={{ borderColor: "var(--bt-border)" }}>
              {activeForm && statusFlags ? (
                <>
                  <h3 className="text-sm font-semibold text-[var(--bt-text)]">
                    {activeForm.title}
                  </h3>
                  <p className="text-[11px] text-[var(--bt-muted)]">
                    {municipalityLabel(selected.municipality)} · {selected.county}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-3">
                    {(
                      [
                        ["Created", statusFlags.created],
                        ["Notarized", statusFlags.notarized],
                        ["Recorded", statusFlags.recorded],
                        ["Downloaded", statusFlags.downloaded],
                      ] as const
                    ).map(([label, ok]) => (
                      <div key={label} className="flex flex-col items-center gap-1 text-[10px]">
                        <Flag ok={ok} />
                        <span className="text-[var(--bt-muted)]">{label}</span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {activeForm.available ? (
                      <>
                        <form action={regenAction}>
                          <input type="hidden" name="jobId" value={jobId} />
                          <input type="hidden" name="packageId" value={selected.id} />
                          <input type="hidden" name="formKey" value={activeForm.formKey} />
                          <button
                            type="submit"
                            disabled={regenPending}
                            className="rounded px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                            style={{ background: "#c2410c" }}
                          >
                            {regenPending ? "Updating…" : "Update Document"}
                          </button>
                        </form>
                        <a
                          href={`/jobs/${jobId}/permitting/packages/${selected.id}/forms/${activeForm.formKey}/pdf`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex rounded px-3 py-1.5 text-xs font-semibold text-[var(--bt-on-primary)]"
                          style={{ background: "var(--bt-primary)" }}
                        >
                          Download Form
                        </a>
                        <form action={markPackageFormDownloadedAction}>
                          <input type="hidden" name="jobId" value={jobId} />
                          <input type="hidden" name="packageId" value={selected.id} />
                          <input type="hidden" name="formKey" value={activeForm.formKey} />
                          <button
                            type="submit"
                            className="text-[10px] text-[var(--bt-muted)] hover:underline"
                          >
                            Mark downloaded
                          </button>
                        </form>
                      </>
                    ) : (
                      <p className="text-xs text-[var(--bt-muted)]">
                        Official PDF not sourced yet — left unavailable (no invented blank).
                      </p>
                    )}
                  </div>
                  {regenState.error ? (
                    <p className="mt-2 text-[11px] text-[var(--bt-hazard)]">{regenState.error}</p>
                  ) : null}
                </>
              ) : (
                <p className="text-sm text-[var(--bt-muted)]">Select a form.</p>
              )}
            </div>

            <div className="rounded border p-3" style={{ borderColor: "var(--bt-border)" }}>
              <div className="mb-3 flex flex-wrap gap-1 border-b pb-2" style={{ borderColor: "var(--bt-border)" }}>
                {SIDE_TABS.map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setSidePanel(t.key)}
                    className="rounded px-2 py-1 text-[10px] font-semibold"
                    style={{
                      background: sidePanel === t.key ? "var(--bt-primary)" : "transparent",
                      color: sidePanel === t.key ? "var(--bt-on-primary)" : "var(--bt-muted)",
                    }}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {sidePanel === "property_owner" ? (
                <form action={ownerAction} className="grid gap-2">
                  <input type="hidden" name="jobId" value={jobId} />
                  <input type="hidden" name="packageId" value={selected.id} />
                  {(
                    [
                      ["ownerName", "Name", selected.owner.name],
                      ["ownerMailingAddress", "Mailing address", selected.owner.mailingAddress],
                      ["ownerCityStateZip", "City / State / Zip", selected.owner.cityStateZip],
                      ["ownerPhone", "Phone", selected.owner.phone],
                      ["ownerCellPhone", "Cell", selected.owner.cellPhone],
                      ["ownerEmail", "Email", selected.owner.email],
                    ] as const
                  ).map(([name, label, value]) => (
                    <label key={name} className="text-[10px] text-[var(--bt-muted)]">
                      {label}
                      <input
                        name={name}
                        defaultValue={value}
                        className="mt-0.5 w-full rounded border px-2 py-1 text-xs text-[var(--bt-text)]"
                        style={{ borderColor: "var(--bt-border)" }}
                      />
                    </label>
                  ))}
                  <button
                    type="submit"
                    disabled={ownerPending}
                    className="mt-1 rounded px-3 py-1.5 text-xs font-semibold text-[var(--bt-on-primary)] disabled:opacity-50"
                    style={{ background: "var(--bt-primary)" }}
                  >
                    {ownerPending ? "Saving…" : "Save owner details"}
                  </button>
                  {ownerState.error ? (
                    <p className="text-[11px] text-[var(--bt-hazard)]">{ownerState.error}</p>
                  ) : null}
                </form>
              ) : null}

              {sidePanel === "contractor" ? (
                selected.contractor ? (
                  <div className="space-y-1 text-xs text-[var(--bt-text)]">
                    <p className="font-semibold">{selected.contractor.companyName}</p>
                    <p>{selected.contractor.qualifierName}</p>
                    <p className="text-[var(--bt-muted)]">
                      {selected.contractor.licenseType} · {selected.contractor.licenseNumber}
                    </p>
                    {selected.contractor.addressLine ? (
                      <p className="text-[var(--bt-muted)]">{selected.contractor.addressLine}</p>
                    ) : null}
                    {selected.contractor.phone ? <p>{selected.contractor.phone}</p> : null}
                    {selected.contractor.email ? <p>{selected.contractor.email}</p> : null}
                    <p className="pt-2 text-[10px] text-[var(--bt-muted)]">
                      Edit licenses under{" "}
                      <a href="/settings/permitting" className="text-[var(--bt-primary)] hover:underline">
                        Permitting settings
                      </a>
                      .
                    </p>
                  </div>
                ) : (
                  <p className="text-xs text-[var(--bt-muted)]">
                    No contractor license linked. Pick one when creating a package, or set licenses in
                    settings.
                  </p>
                )
              ) : null}

              {sidePanel === "notarization" ? (
                <div className="space-y-2 text-xs">
                  <p className="font-semibold text-[var(--bt-text)]">Notarization</p>
                  <p className="text-[var(--bt-muted)]">
                    Notarization requests have not yet been initiated. Remote / clerk notarization is an
                    explicit staff action — never automatic.
                  </p>
                  <button
                    type="button"
                    disabled
                    title="Notary / clerk submit lands in a later batch; no external submit from this panel."
                    className="rounded px-3 py-1.5 text-xs font-semibold opacity-50"
                    style={{ background: "var(--bt-primary)", color: "var(--bt-on-primary)" }}
                  >
                    Get Started
                  </button>
                </div>
              ) : null}

              {sidePanel === "recording" ? (
                <div className="space-y-2 text-xs">
                  <p className="font-semibold text-[var(--bt-text)]">Recording</p>
                  <p className="text-[var(--bt-muted)]">
                    Clerk recording has not yet been initiated. Recording requires an explicit staff
                    click later — this panel never auto-submits.
                  </p>
                  <button
                    type="button"
                    disabled
                    className="rounded px-3 py-1.5 text-xs font-semibold opacity-50"
                    style={{ background: "var(--bt-primary)", color: "var(--bt-on-primary)" }}
                  >
                    Get Started
                  </button>
                </div>
              ) : null}

              {sidePanel === "city_permit" ? (
                <div className="space-y-2 text-xs">
                  <p className="font-semibold text-[var(--bt-text)]">City Permitting</p>
                  {selected.epicsRequest ? (
                    <div className="space-y-1 text-[var(--bt-muted)]">
                      <p>
                        Latest request:{" "}
                        <span className="font-semibold text-[var(--bt-text)]">
                          {selected.epicsRequest.status.replaceAll("_", " ")}
                        </span>{" "}
                        · {formatDate(selected.epicsRequest.requestedAt)}
                      </p>
                      {selected.epicsRequest.resultPermitNumber ? (
                        <p>Permit # {selected.epicsRequest.resultPermitNumber}</p>
                      ) : null}
                      {selected.epicsRequest.lastError ? (
                        <p className="text-[var(--bt-hazard)]">{selected.epicsRequest.lastError}</p>
                      ) : null}
                      {selected.epicsRequest.status === "QUEUED" ? (
                        <p>
                          Queued for the out-of-band Playwright worker (outside Netlify 60s). This web
                          app will not open a browser or auto-submit.
                        </p>
                      ) : null}
                    </div>
                  ) : (
                    <p className="text-[var(--bt-muted)]">
                      Permit creation requests have not yet been initiated.
                    </p>
                  )}
                  {!epicsConnected ? (
                    <p className="text-[var(--bt-muted)]">
                      Connect JAX EPICS under{" "}
                      <a href="/settings/permitting" className="text-[var(--bt-primary)] hover:underline">
                        Permitting settings
                      </a>{" "}
                      before Get Started.
                    </p>
                  ) : null}
                  <form action={epicsAction}>
                    <input type="hidden" name="jobId" value={jobId} />
                    <input type="hidden" name="packageId" value={selected.id} />
                    <button
                      type="submit"
                      disabled={
                        epicsPending ||
                        !epicsConnected ||
                        selected.epicsRequest?.status === "QUEUED" ||
                        selected.epicsRequest?.status === "RUNNING"
                      }
                      className="rounded px-3 py-1.5 text-xs font-semibold text-[var(--bt-on-primary)] disabled:opacity-50"
                      style={{ background: "var(--bt-primary)" }}
                      title={
                        epicsConnected
                          ? "Queue an explicit city permit request for the out-of-band worker — does not submit from this browser."
                          : "Connect JAX EPICS credentials first."
                      }
                    >
                      {epicsPending ? "Queuing…" : "Get Started"}
                    </button>
                  </form>
                  {epicsState.error ? (
                    <p className="text-[11px] text-[var(--bt-hazard)]">{epicsState.error}</p>
                  ) : null}
                  {epicsState.ok ? (
                    <p className="text-[11px] text-[var(--bt-status-open-text)]">
                      Queued. No automatic city submit from this app.
                    </p>
                  ) : null}
                </div>
              ) : null}

              {sidePanel === "settings" ? (
                <div className="space-y-3 text-xs">
                  <form action={renameAction} className="grid gap-2">
                    <input type="hidden" name="jobId" value={jobId} />
                    <input type="hidden" name="packageId" value={selected.id} />
                    <label className="text-[10px] text-[var(--bt-muted)]">
                      Package name
                      <input
                        name="name"
                        defaultValue={selected.name}
                        className="mt-0.5 w-full rounded border px-2 py-1 text-xs"
                        style={{ borderColor: "var(--bt-border)" }}
                      />
                    </label>
                    <button
                      type="submit"
                      disabled={renamePending}
                      className="rounded px-3 py-1.5 font-semibold text-[var(--bt-on-primary)] disabled:opacity-50"
                      style={{ background: "var(--bt-primary)" }}
                    >
                      {renamePending ? "Saving…" : "Edit package name"}
                    </button>
                    {renameState.error ? (
                      <p className="text-[11px] text-[var(--bt-hazard)]">{renameState.error}</p>
                    ) : null}
                  </form>

                  <div className="flex flex-wrap gap-2">
                    {selected.status !== "ACTIVE" ? (
                      <form action={setPermitPackageStatusAction}>
                        <input type="hidden" name="jobId" value={jobId} />
                        <input type="hidden" name="packageId" value={selected.id} />
                        <input type="hidden" name="status" value="ACTIVE" />
                        <button type="submit" className="text-[var(--bt-primary)] hover:underline">
                          Move to Active
                        </button>
                      </form>
                    ) : null}
                    {selected.status !== "SENT_TO_CONTRACTORS" ? (
                      <form action={setPermitPackageStatusAction}>
                        <input type="hidden" name="jobId" value={jobId} />
                        <input type="hidden" name="packageId" value={selected.id} />
                        <input type="hidden" name="status" value="SENT_TO_CONTRACTORS" />
                        <button type="submit" className="text-[var(--bt-primary)] hover:underline">
                          Mark sent to contractors
                        </button>
                      </form>
                    ) : null}
                    {selected.status !== "ARCHIVED" ? (
                      <form action={setPermitPackageStatusAction}>
                        <input type="hidden" name="jobId" value={jobId} />
                        <input type="hidden" name="packageId" value={selected.id} />
                        <input type="hidden" name="status" value="ARCHIVED" />
                        <button type="submit" className="text-[var(--bt-hazard)] hover:underline">
                          Archive
                        </button>
                      </form>
                    ) : null}
                    <form action={removePermitPackageAction}>
                      <input type="hidden" name="jobId" value={jobId} />
                      <input type="hidden" name="packageId" value={selected.id} />
                      <button
                        type="submit"
                        className="text-[var(--bt-hazard)] hover:underline"
                        onClick={(e) => {
                          if (!window.confirm("Remove this package permanently?")) {
                            e.preventDefault();
                          }
                        }}
                      >
                        Remove
                      </button>
                    </form>
                  </div>
                  <p className="text-[10px] text-[var(--bt-muted)]">
                    Send reminder / invitation email needs an email provider — not wired here. No
                    external city/notary submit from Settings.
                  </p>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
