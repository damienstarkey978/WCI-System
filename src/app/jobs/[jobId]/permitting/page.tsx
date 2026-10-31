import Link from "next/link";
import { notFound } from "next/navigation";

import { SetupNotice } from "@/app/admin/setup-notice";
import { PageHeader } from "@/components/shell/PageHeader";
import { currentAppUser } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  inspectionResultLabel,
  permitDisplayTitle,
  permitStatusLabel,
} from "@/lib/permitting/labels";
import {
  availableTradesToAdd,
  catalogInspectionNamesForTrade,
  ensureBuildingPermit,
  getJobPermitting,
  hasActiveBuildingPermit,
  hasBuildingPermitDocs,
  JobNotFoundError,
  permitRockstarLedgerFromJob,
  tradeLabel,
} from "@/lib/permitting/service";

import {
  removeJobPermitAction,
  removePermitInspectionAction,
  setInspectionCompletedAction,
  setPermitPulledAction,
} from "./actions";
import { AddInspectionForm } from "./add-inspection-form";
import { AddPermitForm } from "./add-permit-form";
import { AssignVendorForm } from "./assign-vendor-form";
import { CreatePackageForm } from "./create-package-form";
import { EditInspectionForm } from "./edit-inspection-form";
import { EditPermitForm } from "./edit-permit-form";
import { PackagesPanel } from "./packages-panel";
import { PermitRockstarForm } from "./permit-rockstar-form";
import { PermitReminderButton } from "./permit-reminder-button";
import { JACKSONVILLE_BUILDING_FORMS } from "@/lib/permitting/form-catalog";
import { loadDuvalJaxManifest } from "@/lib/permitting/form-manifest";
import { ensureDefaultWciContractorLicense, listContractorLicenses } from "@/lib/permitting/package-settings";
import { isJaxEpicsConnected, latestEpicsSubmitForPackage } from "@/lib/permitting/epics-seam";
import { listPermitPackagesForJob, packageGridFlags } from "@/lib/permitting/packages";

export const dynamic = "force-dynamic";

function fieldBag(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function fieldStr(bag: Record<string, unknown>, key: string): string {
  const v = bag[key];
  return typeof v === "string" ? v : "";
}

function licenseAddressLine(license: {
  addressLine1: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
} | null): string {
  if (!license) return "";
  const line1 = license.addressLine1?.trim() ?? "";
  const cityLine = [license.city, license.state, license.postalCode].filter(Boolean).join(", ");
  return [line1, cityLine].filter(Boolean).join(", ");
}

function StatusChip({
  ok,
  label,
  tone,
}: {
  ok?: boolean;
  label: string;
  tone?: "ok" | "warn" | "bad" | "neutral";
}) {
  const resolved =
    tone ?? (ok === true ? "ok" : ok === false ? "bad" : "neutral");
  const styles =
    resolved === "ok"
      ? {
          background: "color-mix(in srgb, var(--bt-status-open-bg) 80%, transparent)",
          color: "var(--bt-status-open-text)",
        }
      : resolved === "warn"
        ? {
            background: "color-mix(in srgb, #d97706 18%, transparent)",
            color: "#b45309",
          }
        : resolved === "bad"
          ? {
              background: "color-mix(in srgb, var(--bt-hazard) 18%, transparent)",
              color: "var(--bt-hazard)",
            }
          : {
              background: "color-mix(in srgb, var(--bt-border) 55%, transparent)",
              color: "var(--bt-muted)",
            };
  return (
    <span className="rounded-full px-2.5 py-1 text-xs font-semibold" style={styles}>
      {label}
    </span>
  );
}

function permitChipTone(status: string): "ok" | "warn" | "bad" | "neutral" {
  switch (status) {
    case "ACTIVE":
      return "ok";
    case "FINALIZED":
      return "ok";
    case "PENDING_PAYMENT":
    case "RETURNED_FOR_CORRECTIONS":
      return "warn";
    case "EXPIRED":
    case "CANCELLED":
      return "bad";
    default:
      return "neutral";
  }
}

export default async function PermittingPage({ params }: PageProps<"/jobs/[jobId]/permitting">) {
  const { jobId } = await params;

  let user;
  try {
    user = await currentAppUser();
  } catch (error) {
    return <SetupNotice detail={error instanceof Error ? error.message : String(error)} />;
  }
  if (!user) {
    return <SetupNotice detail="No organization found. Seed the database, then reload." />;
  }

  // Building only — never auto-seed Electrical / Plumbing / Mechanical / Roofing.
  try {
    await ensureBuildingPermit(user.organizationId, jobId);
  } catch (error) {
    if (error instanceof JobNotFoundError) notFound();
    throw error;
  }

  let job;
  try {
    job = await getJobPermitting(user.organizationId, jobId);
  } catch (error) {
    if (error instanceof JobNotFoundError) notFound();
    throw error;
  }

  const vendors = await db.vendor.findMany({
    where: { organizationId: user.organizationId },
    orderBy: { name: "asc" },
    select: { id: true, name: true, email: true, tradeType: true },
  });

  await ensureDefaultWciContractorLicense(user.organizationId);
  const [packages, licenses, epicsConnected] = await Promise.all([
    listPermitPackagesForJob(user.organizationId, jobId),
    listContractorLicenses(user.organizationId),
    isJaxEpicsConnected(user.organizationId),
  ]);
  const epicsByPackageId = new Map(
    (
      await Promise.all(
        packages.map(async (pkg) => {
          const latest = await latestEpicsSubmitForPackage(user.organizationId, pkg.id);
          return [pkg.id, latest] as const;
        }),
      )
    ),
  );

  const tradesAvailable = availableTradesToAdd(job.permits.map((p) => p.trade));
  const docsCreated = hasBuildingPermitDocs(job.buildingPermitDocsCreatedAt);
  const activePermit = hasActiveBuildingPermit(job.permits);
  const rockstarLedger = permitRockstarLedgerFromJob(job);
  const buildingPermitId = job.permits.find((p) => p.trade === "BUILDING")?.id ?? null;
  const propertyAddress = [job.addressLine1, job.city, job.state, job.postalCode]
    .filter(Boolean)
    .join(", ");
  const manifestByKey = new Map(loadDuvalJaxManifest().forms.map((f) => [f.key, f]));
  const formAvailability = JACKSONVILLE_BUILDING_FORMS.map((f) => {
    const m = manifestByKey.get(f.key);
    return {
      key: f.key,
      title: f.title,
      available: m?.status === "available" && Boolean(m.file),
      revisionDate: m?.revisionDate ?? null,
    };
  });

  const packageRows = packages.map((pkg) => {
    const flags = packageGridFlags(pkg);
    const bag = fieldBag(pkg.fieldValues);
    const license = pkg.contractorLicense;
    return {
      id: pkg.id,
      name: pkg.name,
      status: pkg.status as "ACTIVE" | "SENT_TO_CONTRACTORS" | "ARCHIVED",
      county: pkg.county,
      municipality: pkg.municipality,
      permitType: pkg.permitType,
      propertyAddress: pkg.propertyAddress,
      nocCreated: flags.nocCreated,
      packageCreated: flags.packageCreated,
      notarized: flags.notarized,
      recorded: flags.recorded,
      initiatedAt: flags.initiatedAt.toISOString(),
      jobPermitId: pkg.jobPermitId,
      jobPermitLabel: pkg.jobPermitId
        ? (job.permits.find((p) => p.id === pkg.jobPermitId)
            ? permitDisplayTitle(job.permits.find((p) => p.id === pkg.jobPermitId)!)
            : "Linked permit")
        : null,
      forms: pkg.forms.map((f) => ({
        id: f.id,
        formKey: f.formKey,
        title: f.title,
        status: f.status,
        available: formAvailability.some((m) => m.key === f.formKey && m.available),
      })),
      owner: {
        name: fieldStr(bag, "ownerName"),
        mailingAddress: fieldStr(bag, "ownerMailingAddress"),
        cityStateZip: fieldStr(bag, "ownerCityStateZip"),
        phone: fieldStr(bag, "ownerPhone"),
        cellPhone: fieldStr(bag, "ownerCellPhone"),
        email: fieldStr(bag, "ownerEmail"),
      },
      contractor: license
        ? {
            companyName: license.companyName,
            qualifierName: license.qualifierName,
            licenseNumber: license.licenseNumber,
            licenseType: license.licenseType,
            addressLine: licenseAddressLine(license),
            phone: license.phone ?? "",
            email: license.email ?? "",
          }
        : null,
      epicsRequest: (() => {
        const latest = epicsByPackageId.get(pkg.id) ?? null;
        if (!latest) return null;
        return {
          id: latest.id,
          status: latest.status,
          requestedAt: latest.requestedAt.toISOString(),
          lastError: latest.lastError,
          resultPermitNumber: latest.resultPermitNumber,
        };
      })(),
    };
  });

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 p-4 sm:p-6">
      <PageHeader jobName={job.name} title="Permitting" />
      <p className="-mt-2 text-sm text-[var(--bt-muted)]">
        Building stays on the job by default. Add temp pole, site, MEP, or roofing as needed — duplicates
        of the same type are allowed.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={`/jobs/${job.id}/permitting/docs`}
          className="inline-flex items-center justify-center rounded px-3 py-2 text-xs font-semibold text-[var(--bt-on-primary)]"
          style={{ background: "var(--bt-primary)" }}
        >
          {docsCreated ? "View building permit docs" : "Create building permit docs"}
        </Link>
        <Link href="/settings/permitting" className="text-xs text-[var(--bt-primary)] hover:underline">
          Permitting settings
        </Link>
        <span className="text-xs text-[var(--bt-muted)]">
          Duval / City of Jacksonville pack (NOC, NTBO, applications…)
        </span>
      </div>

      <section
        className="rounded-lg border bg-[var(--bt-panel-bg)] p-3 sm:p-4"
        style={{ borderColor: "var(--bt-border)" }}
        aria-label="Permit packages"
      >
        <h2 className="text-base font-semibold text-[var(--bt-text)]">My Permit Packages</h2>
        <p className="mb-3 text-xs text-[var(--bt-muted)]">
          Rockstar-style packages for this job. Official Jacksonville PDFs only when sourced. Download /
          update documents never submit to the city, clerk, or notary.
        </p>
        {packageRows.length > 0 ? (
          <div className="mb-4">
            <PackagesPanel
              jobId={job.id}
              packages={packageRows}
              jobPermits={job.permits.map((p) => ({
                id: p.id,
                label: permitDisplayTitle(p),
              }))}
              epicsConnected={epicsConnected}
            />
          </div>
        ) : (
          <p className="mb-3 text-sm text-[var(--bt-muted)]">No packages yet.</p>
        )}
        <CreatePackageForm
          jobId={job.id}
          defaultAddress={propertyAddress}
          defaultPackageName={`${job.name} — permit package`}
          buildingPermitId={buildingPermitId}
          licenses={licenses.map((l) => ({
            id: l.id,
            qualifierName: l.qualifierName,
            licenseNumber: l.licenseNumber,
          }))}
          formAvailability={formAvailability}
        />
      </section>

      <section
        className="rounded-lg border bg-[var(--bt-panel-bg)] p-3 sm:p-4"
        style={{ borderColor: "var(--bt-border)" }}
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-[var(--bt-text)]">{job.name}</h2>
            <p className="mt-0.5 text-xs text-[var(--bt-muted)]">
              {job.status.replaceAll("_", " ")}
              {job.permitNumber ? ` · Job permit # ${job.permitNumber}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap gap-2" aria-label="Permitting status">
            <StatusChip ok={docsCreated} label={docsCreated ? "Docs created" : "Docs missing"} />
            <StatusChip ok={activePermit} label={activePermit ? "Active permit" : "No active permit"} />
          </div>
        </div>

        <PermitRockstarForm jobId={job.id} ledger={rockstarLedger} />

        <div className="mt-4 border-t pt-3" style={{ borderColor: "var(--bt-border)" }}>
          <p className="mb-2 text-xs font-medium text-[var(--bt-muted)]">Add a permit</p>
          <AddPermitForm jobId={job.id} trades={tradesAvailable} />
        </div>

        <div className="mt-4 grid gap-3">
          {job.permits.length === 0 ? (
            <p
              className="rounded border px-3 py-6 text-center text-sm text-[var(--bt-muted)]"
              style={{ borderColor: "var(--bt-border)" }}
            >
              No permits yet. Building will appear once the page finishes loading — add more only if
              needed.
            </p>
          ) : (
            job.permits.map((permit) => {
              const done = permit.inspections.filter((i) => i.completedAt).length;
              const total = permit.inspections.length;
              return (
                <div key={permit.id} className="rounded border p-3" style={{ borderColor: "var(--bt-border)" }}>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <h3 className="text-sm font-semibold text-[var(--bt-text)]">
                        {permitDisplayTitle(permit)}
                      </h3>
                      <p className="text-xs text-[var(--bt-muted)]">
                        {tradeLabel(permit.trade)}
                        {permit.permitNumber ? ` · # ${permit.permitNumber}` : " · No permit number yet"}
                        {permit.contractorName ? ` · ${permit.contractorName}` : ""}
                        {permit.vendor ? ` · vendor ${permit.vendor.name}` : ""}
                      </p>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        <StatusChip
                          tone={permitChipTone(permit.status)}
                          label={permitStatusLabel(permit.status)}
                        />
                        {permit.expiresAt ? (
                          <StatusChip
                            tone={permit.status === "EXPIRED" ? "bad" : "neutral"}
                            label={`Expires ${new Date(permit.expiresAt).toLocaleDateString()}`}
                          />
                        ) : null}
                        {permit.jurisdiction ? (
                          <StatusChip tone="neutral" label={permit.jurisdiction} />
                        ) : null}
                        {permit.issuedAt ? (
                          <StatusChip
                            tone="neutral"
                            label={`Issued ${new Date(permit.issuedAt).toLocaleDateString()}`}
                          />
                        ) : null}
                      </div>
                    </div>
                    <div className="flex flex-col gap-2 sm:items-end">
                      <form action={setPermitPulledAction} className="flex items-center gap-2">
                        <input type="hidden" name="jobId" value={job.id} />
                        <input type="hidden" name="permitId" value={permit.id} />
                        <input type="hidden" name="pulled" value={permit.pulled ? "false" : "true"} />
                        <button
                          type="submit"
                          className="rounded px-2.5 py-1 text-xs font-semibold"
                          style={{
                            background: permit.pulled ? "var(--bt-status-open-bg)" : "transparent",
                            color: permit.pulled ? "var(--bt-status-open-text)" : "var(--bt-text)",
                            border: "1px solid var(--bt-border)",
                          }}
                        >
                          {permit.pulled ? "Pulled" : "Not pulled"}
                        </button>
                      </form>
                      {!permit.pulled ? (
                        <PermitReminderButton
                          jobId={job.id}
                          permitId={permit.id}
                          disabled={!permit.vendor?.email}
                        />
                      ) : null}
                      {permit.trade !== "BUILDING" || job.permits.filter((p) => p.trade === "BUILDING").length > 1 ? (
                        <form action={removeJobPermitAction}>
                          <input type="hidden" name="jobId" value={job.id} />
                          <input type="hidden" name="permitId" value={permit.id} />
                          <button
                            type="submit"
                            className="text-[10px] font-semibold text-[var(--bt-muted)] hover:text-red-600"
                          >
                            Remove permit
                          </button>
                        </form>
                      ) : null}
                    </div>
                  </div>

                  <EditPermitForm jobId={job.id} permit={permit} />

                  <AssignVendorForm
                    jobId={job.id}
                    permitId={permit.id}
                    vendorId={permit.vendorId}
                    vendors={vendors}
                  />

                  <div className="mt-3">
                    <p className="mb-1.5 text-xs font-medium text-[var(--bt-muted)]">
                      Inspections{total > 0 ? ` · ${done}/${total} complete` : ""}
                    </p>
                    {total === 0 ? (
                      <p className="text-xs text-[var(--bt-muted)]">
                        None yet — add typical inspections for this trade (folders appear under Inspection
                        Pictures).
                      </p>
                    ) : (
                      <ul className="grid gap-2">
                        {permit.inspections.map((inspection) => {
                          const doneFlag = inspection.completedAt != null;
                          return (
                            <li
                              key={inspection.id}
                              className="rounded border"
                              style={{ borderColor: "var(--bt-border)" }}
                            >
                              <div className="flex items-stretch gap-1">
                                <form action={setInspectionCompletedAction} className="min-w-0 flex-1">
                                  <input type="hidden" name="jobId" value={job.id} />
                                  <input type="hidden" name="inspectionId" value={inspection.id} />
                                  <input
                                    type="hidden"
                                    name="completed"
                                    value={doneFlag ? "false" : "true"}
                                  />
                                  <button
                                    type="submit"
                                    className="flex w-full items-center gap-2 px-2.5 py-2 text-left text-xs sm:py-1.5"
                                  >
                                    <span
                                      aria-hidden
                                      className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px]"
                                      style={{
                                        borderColor: "var(--bt-border)",
                                        background: doneFlag ? "var(--bt-primary)" : "transparent",
                                        color: doneFlag ? "var(--bt-on-primary)" : "transparent",
                                      }}
                                    >
                                      ✓
                                    </span>
                                    <span className="min-w-0">
                                      <span
                                        className={
                                          doneFlag
                                            ? "text-[var(--bt-muted)] line-through"
                                            : "text-[var(--bt-text)]"
                                        }
                                      >
                                        {inspection.name}
                                      </span>
                                      <span className="mt-0.5 block text-[10px] text-[var(--bt-muted)]">
                                        {inspectionResultLabel(inspection.result)}
                                        {inspection.passedAt
                                          ? ` · passed ${new Date(inspection.passedAt).toLocaleDateString()}`
                                          : ""}
                                        {inspection.confirmationNumber
                                          ? ` · conf ${inspection.confirmationNumber}`
                                          : ""}
                                        {inspection.inspector ? ` · ${inspection.inspector}` : ""}
                                      </span>
                                    </span>
                                  </button>
                                </form>
                                <form
                                  action={removePermitInspectionAction}
                                  className="shrink-0 self-center pr-1"
                                >
                                  <input type="hidden" name="jobId" value={job.id} />
                                  <input type="hidden" name="inspectionId" value={inspection.id} />
                                  <button
                                    type="submit"
                                    aria-label={`Remove ${inspection.name} from this job`}
                                    className="rounded px-2 py-1 text-[10px] font-semibold text-[var(--bt-muted)] hover:text-red-600"
                                  >
                                    Remove
                                  </button>
                                </form>
                              </div>
                              <EditInspectionForm
                                jobId={job.id}
                                inspection={inspection}
                                permits={job.permits.map((p) => ({
                                  id: p.id,
                                  trade: p.trade,
                                  label: p.label,
                                }))}
                              />
                            </li>
                          );
                        })}
                      </ul>
                    )}
                    <AddInspectionForm
                      jobId={job.id}
                      permitId={permit.id}
                      catalogNames={catalogInspectionNamesForTrade(permit.trade)}
                      existingNames={permit.inspections.map((i) => i.name)}
                    />
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}
