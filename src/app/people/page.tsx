import Link from "next/link";

import { SetupNotice } from "@/app/admin/setup-notice";
import { UserRole } from "@/generated/prisma/enums";
import { currentAppUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ROLE_DESCRIPTIONS } from "@/lib/staff/role-descriptions";

export const dynamic = "force-dynamic";

/**
 * Buildertrend's "People" icon opens a directory spanning internal team,
 * vendors, and clients. Team is a read-only summary here — admins manage
 * staff accounts (invite, role, deactivate) on the full /staff directory.
 */
export default async function PeoplePage() {
  let user;
  try {
    user = await currentAppUser();
  } catch (error) {
    return <SetupNotice detail={error instanceof Error ? error.message : String(error)} />;
  }
  if (!user) {
    return <SetupNotice detail="No organization found. Seed the database, then reload." />;
  }

  const [team, vendorCount, clientCount] = await Promise.all([
    db.user.findMany({ where: { organizationId: user.organizationId, isActive: true }, orderBy: { email: "asc" } }),
    db.vendor.count({ where: { organizationId: user.organizationId } }),
    db.client.count({ where: { organizationId: user.organizationId } }),
  ]);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4 p-6">
      <h1 className="text-xl font-semibold text-[var(--bt-text)]">People</h1>

      <div className="grid gap-4 sm:grid-cols-3">
        <Link href="/staff" className="rounded-lg border bg-[var(--bt-panel-bg)] p-4 hover:border-[var(--bt-primary)]" style={{ borderColor: "var(--bt-border)" }}>
          <h2 className="text-sm font-semibold text-[var(--bt-text)]">Internal Users</h2>
          <p className="mt-1 text-2xl font-semibold text-[var(--bt-text)]">{team.length}</p>
          <p className="text-xs text-[var(--bt-muted)]">Your team&apos;s accounts &amp; roles</p>
        </Link>
        <Link href="/vendors" className="rounded-lg border bg-[var(--bt-panel-bg)] p-4 hover:border-[var(--bt-primary)]" style={{ borderColor: "var(--bt-border)" }}>
          <h2 className="text-sm font-semibold text-[var(--bt-text)]">Vendors</h2>
          <p className="mt-1 text-2xl font-semibold text-[var(--bt-text)]">{vendorCount}</p>
          <p className="text-xs text-[var(--bt-muted)]">Subcontractors and suppliers</p>
        </Link>
        <Link href="/clients" className="rounded-lg border bg-[var(--bt-panel-bg)] p-4 hover:border-[var(--bt-primary)]" style={{ borderColor: "var(--bt-border)" }}>
          <h2 className="text-sm font-semibold text-[var(--bt-text)]">Clients</h2>
          <p className="mt-1 text-2xl font-semibold text-[var(--bt-text)]">{clientCount}</p>
          <p className="text-xs text-[var(--bt-muted)]">Homeowners with portal access</p>
        </Link>
      </div>

      <section className="rounded-lg border bg-[var(--bt-panel-bg)] p-4" style={{ borderColor: "var(--bt-border)" }}>
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[var(--bt-text)]">Team</h2>
          {user.role === UserRole.ADMIN ? (
            <Link href="/staff" className="text-xs font-semibold text-[var(--bt-primary)] hover:underline">
              Manage staff &amp; permissions →
            </Link>
          ) : null}
        </div>
        <ul className="mt-2 divide-y" style={{ borderColor: "var(--bt-border)" }}>
          {team.map((member) => (
            <li key={member.id} className="flex items-center justify-between py-2 text-sm">
              <span className="text-[var(--bt-text)]">{member.name ?? member.email}</span>
              <span className="text-xs text-[var(--bt-muted)]">{member.title ?? ROLE_DESCRIPTIONS[member.role].label}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
