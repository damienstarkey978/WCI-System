import Link from "next/link";
import type { ReactNode } from "react";

import { SetupNotice } from "@/app/admin/setup-notice";
import { UserRole } from "@/generated/prisma/enums";
import { currentAppUser } from "@/lib/auth";
import { db } from "@/lib/db";

import { CompanyInfoForm } from "./company-info-form";

export const dynamic = "force-dynamic";

function SettingsGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border bg-[var(--bt-panel-bg)] p-4" style={{ borderColor: "var(--bt-border)" }}>
      <h2 className="mb-2 text-sm font-semibold text-[var(--bt-text)]">{title}</h2>
      <div className="flex flex-col gap-2 text-sm">{children}</div>
    </div>
  );
}

function SettingsLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="text-[var(--bt-primary)] hover:underline">
      {label}
    </Link>
  );
}

/** Not built yet — shown honestly rather than linking somewhere misleading. */
function ComingSoon({ label }: { label: string }) {
  return (
    <span className="text-[var(--bt-muted)]" title="Coming soon">
      {label}
    </span>
  );
}

/**
 * Company Settings — admin only, reached from the avatar menu. Mirrors Buildertrend's
 * grouped-card layout (per Damien's screenshot, 2026-08-29) with one deliberate
 * omission: no Integrations group — WCI OS is building this functionality itself
 * rather than integrating a marketplace of external tools into it. Each item below
 * either links to a real, already-built page or — where Buildertrend's equivalent is
 * genuine org-level configuration WCI OS hasn't built a settings screen for yet
 * (schedule/daily-log/change-order templates, default job permissions, tax rates,
 * role permission editing, etc.) — shows as a plain "coming soon" label instead of a
 * dead link.
 */
export default async function CompanySettingsPage() {
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
          Only an admin can view company settings.
        </div>
      </div>
    );
  }

  const organization = await db.organization.findUnique({
    where: { id: user.organizationId },
    select: { name: true, logoPath: true, addressLine1: true, city: true, state: true, postalCode: true, contactEmail: true, contactPhone: true },
  });
  if (!organization) return <SetupNotice detail="Organization not found." />;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 p-6">
      <h1 className="text-xl font-semibold text-[var(--bt-text)]">Company settings</h1>

      <div className="rounded-lg border bg-[var(--bt-panel-bg)] p-4" style={{ borderColor: "var(--bt-border)" }}>
        <h2 className="mb-2 text-sm font-semibold text-[var(--bt-text)]">World Construction Inc.</h2>
        <CompanyInfoForm info={organization} />
        <div className="mt-3 border-t pt-3" style={{ borderColor: "var(--bt-border)" }}>
          <SettingsLink href="/jobs" label="Jobs →" />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <SettingsGroup title="Client settings">
          <ComingSoon label="Default job permissions" />
        </SettingsGroup>

        <SettingsGroup title="Sales">
          <SettingsLink href="/leads" label="Sales" />
          <SettingsLink href="/leads" label="Lead Generation" />
        </SettingsGroup>

        <SettingsGroup title="Files">
          <ComingSoon label="Files" />
        </SettingsGroup>

        <SettingsGroup title="Project management">
          <ComingSoon label="Schedule" />
          <ComingSoon label="Daily Logs" />
          <ComingSoon label="Change Orders" />
          <ComingSoon label="Selections" />
          <ComingSoon label="Warranty" />
          <ComingSoon label="Time Clock" />
          <ComingSoon label="Client Updates" />
        </SettingsGroup>

        <SettingsGroup title="Messaging">
          <ComingSoon label="Surveys" />
          <ComingSoon label="RFIs" />
        </SettingsGroup>

        <SettingsGroup title="Financials">
          <SettingsLink href="/admin/cost-codes" label="Cost codes" />
          <SettingsLink href="/materials" label="Catalog" />
          <SettingsLink href="/settings/quickbooks" label="QuickBooks" />
          <ComingSoon label="Bids" />
          <ComingSoon label="Estimates" />
          <ComingSoon label="Bills / POs / Budget" />
          <ComingSoon label="Invoices" />
          <ComingSoon label="Online Payments" />
          <ComingSoon label="Taxes" />
        </SettingsGroup>

        <SettingsGroup title="Directory">
          <SettingsLink href="/settings/roles" label="Role management" />
          <SettingsLink href="/staff" label="Internal users" />
          <SettingsLink href="/clients" label="Client contacts" />
          <SettingsLink href="/vendors" label="Subs/vendors" />
        </SettingsGroup>

        <SettingsGroup title="Developer">
          <SettingsLink href="/settings/api-keys" label="API keys" />
        </SettingsGroup>
      </div>
    </div>
  );
}
