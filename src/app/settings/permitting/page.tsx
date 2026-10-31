import Link from "next/link";

import { SetupNotice } from "@/app/admin/setup-notice";
import { CityPortalKind, UserRole } from "@/generated/prisma/enums";
import { currentAppUser } from "@/lib/auth";
import {
  ensureDefaultWciContractorLicense,
  listCityPortalCredentials,
  listContractorLicenses,
  listDesignProfessionals,
  listFormSetTemplates,
  listNocPresets,
  listPaisProductTemplates,
} from "@/lib/permitting/package-settings";

import {
  DesignProCreateForm,
  DesignProDeleteButton,
  EpicsConnectForm,
  FormSetCreateForm,
  FormSetDeleteButton,
  LicenseCreateForm,
  LicenseDeleteButton,
  NocPresetForm,
  PaisTemplateCreateForm,
  PaisTemplateDeleteButton,
  SeedLicenseButton,
} from "./permitting-settings-forms";

export const dynamic = "force-dynamic";

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border bg-[var(--bt-panel-bg)] p-4" style={{ borderColor: "var(--bt-border)" }}>
      <h2 className="mb-3 text-sm font-semibold text-[var(--bt-text)]">{title}</h2>
      {children}
    </section>
  );
}

export default async function PermittingSettingsPage() {
  let user;
  try {
    user = await currentAppUser();
  } catch (error) {
    return <SetupNotice detail={error instanceof Error ? error.message : String(error)} />;
  }
  if (!user) {
    return <SetupNotice detail="No organization found. Seed the database, then reload." />;
  }
  if (user.role !== UserRole.ADMIN) {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
          Only an admin can manage permitting settings.
        </div>
      </div>
    );
  }

  await ensureDefaultWciContractorLicense(user.organizationId);

  const [licenses, nocPresets, designPros, formSets, paisTemplates, portals] = await Promise.all([
    listContractorLicenses(user.organizationId),
    listNocPresets(user.organizationId),
    listDesignProfessionals(user.organizationId),
    listFormSetTemplates(user.organizationId),
    listPaisProductTemplates(user.organizationId),
    listCityPortalCredentials(user.organizationId),
  ]);

  const duvalNoc = nocPresets.find((p) => p.county === "DUVAL") ?? null;
  const epics = portals.find((p) => p.portal === CityPortalKind.JAX_EPICS);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4 p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-xl font-semibold text-[var(--bt-text)]">Permitting settings</h1>
        <Link href="/settings/company" className="text-sm text-[var(--bt-primary)] hover:underline">
          ← Company settings
        </Link>
      </div>
      <p className="text-sm text-[var(--bt-muted)]">
        Org-level licenses, NOC presets, design professionals, form-set / PAIS templates, and JAX EPICS
        credentials. Package creation lives on each job&apos;s Permitting page. No city/notary submission
        happens from this screen.
      </p>

      <Panel title="Contractor licenses">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <SeedLicenseButton />
          <span className="text-xs text-[var(--bt-muted)]">Idempotent seed of the live WCI CGC card.</span>
        </div>
        {licenses.length === 0 ? (
          <p className="mb-3 text-sm text-[var(--bt-muted)]">No licenses yet.</p>
        ) : (
          <ul className="mb-4 divide-y text-sm" style={{ borderColor: "var(--bt-border)" }}>
            {licenses.map((lic) => (
              <li key={lic.id} className="flex flex-wrap items-start justify-between gap-2 py-2">
                <div>
                  <div className="font-medium text-[var(--bt-text)]">
                    {lic.qualifierName} · {lic.licenseNumber}
                  </div>
                  <div className="text-[var(--bt-muted)]">
                    {lic.licenseType} · {lic.companyName}
                    {lic.active ? "" : " · inactive"}
                  </div>
                </div>
                <LicenseDeleteButton id={lic.id} />
              </li>
            ))}
          </ul>
        )}
        <LicenseCreateForm />
      </Panel>

      <Panel title="NOC presets (Duval)">
        <NocPresetForm
          preset={
            duvalNoc
              ? {
                  county: duvalNoc.county,
                  descriptionOfImprovement: duvalNoc.descriptionOfImprovement,
                  ownersInterest: duvalNoc.ownersInterest,
                  designatedPersonForNotices: duvalNoc.designatedPersonForNotices,
                  lienorsNoticeRecipient: duvalNoc.lienorsNoticeRecipient,
                  expirationRule: duvalNoc.expirationRule,
                }
              : null
          }
        />
      </Panel>

      <Panel title="Design professionals">
        {designPros.length === 0 ? (
          <p className="mb-3 text-sm text-[var(--bt-muted)]">None recorded.</p>
        ) : (
          <ul className="mb-4 divide-y text-sm">
            {designPros.map((pro) => (
              <li key={pro.id} className="flex justify-between gap-2 py-2">
                <div>
                  <div className="font-medium">
                    {pro.name} · {pro.kind}
                  </div>
                  <div className="text-[var(--bt-muted)]">
                    {[pro.firm, pro.licenseNumber, pro.email].filter(Boolean).join(" · ")}
                  </div>
                </div>
                <DesignProDeleteButton id={pro.id} />
              </li>
            ))}
          </ul>
        )}
        <DesignProCreateForm />
      </Panel>

      <Panel title="Form-set templates">
        {formSets.length === 0 ? (
          <p className="mb-3 text-sm text-[var(--bt-muted)]">No templates yet (e.g. Roof, Siding).</p>
        ) : (
          <ul className="mb-4 divide-y text-sm">
            {formSets.map((tpl) => (
              <li key={tpl.id} className="flex justify-between gap-2 py-2">
                <div>
                  <div className="font-medium">{tpl.name}</div>
                  <div className="text-[var(--bt-muted)]">
                    {tpl.county}
                    {tpl.municipality ? ` / ${tpl.municipality}` : ""} · {tpl.permitType} ·{" "}
                    {Array.isArray(tpl.formKeys) ? tpl.formKeys.length : 0} forms
                  </div>
                </div>
                <FormSetDeleteButton id={tpl.id} />
              </li>
            ))}
          </ul>
        )}
        <FormSetCreateForm />
      </Panel>

      <Panel title="PAIS product templates">
        {paisTemplates.length === 0 ? (
          <p className="mb-3 text-sm text-[var(--bt-muted)]">No product templates yet.</p>
        ) : (
          <ul className="mb-4 divide-y text-sm">
            {paisTemplates.map((tpl) => (
              <li key={tpl.id} className="flex justify-between gap-2 py-2">
                <div>
                  <div className="font-medium">{tpl.name}</div>
                  <div className="text-[var(--bt-muted)]">
                    {[tpl.manufacturer, tpl.model, tpl.approvalNumber].filter(Boolean).join(" · ")}
                  </div>
                </div>
                <PaisTemplateDeleteButton id={tpl.id} />
              </li>
            ))}
          </ul>
        )}
        <PaisTemplateCreateForm />
      </Panel>

      <Panel title="JAX EPICS connection">
        <EpicsConnectForm connected={Boolean(epics?.connected)} username={epics?.username} />
      </Panel>
    </div>
  );
}
