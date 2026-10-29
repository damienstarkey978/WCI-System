import Link from "next/link";

import { SetupNotice } from "@/app/admin/setup-notice";
import { UserRole } from "@/generated/prisma/enums";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { ROLE_DESCRIPTIONS } from "@/lib/staff/role-descriptions";
import { listRoleSiteAccess, SITE_ACCESS_ROLES } from "@/lib/staff/role-site-access";

import { RoleAccessForm } from "./role-access-form";

export const dynamic = "force-dynamic";

/**
 * Role management — descriptions + editable per-role site-access toggles.
 * Sales Rep defaults job financials OFF (Commission remains in the Financial menu).
 */
export default async function RoleManagementPage() {
  let admin;
  try {
    admin = await requireRole(UserRole.ADMIN);
  } catch (error) {
    return <SetupNotice detail={error instanceof Error ? error.message : String(error)} />;
  }

  const [staff, accessByRole] = await Promise.all([
    db.user.findMany({
      where: { organizationId: admin.organizationId, isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true, role: true, agentKind: true },
    }),
    listRoleSiteAccess(admin.organizationId),
  ]);

  const staffByRole = new Map<UserRole, typeof staff>();
  for (const member of staff) {
    staffByRole.set(member.role, [...(staffByRole.get(member.role) ?? []), member]);
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 p-6">
      <div>
        <Link href="/settings/company" className="text-sm text-[var(--bt-primary)] hover:underline">
          ← Company settings
        </Link>
        <h1 className="mt-1 text-xl font-semibold text-[var(--bt-text)]">Role management</h1>
        <p className="text-sm text-[var(--bt-muted)]">What each role can do on the site, and who currently holds it.</p>
      </div>

      <div className="flex flex-col gap-3">
        {SITE_ACCESS_ROLES.map((role) => {
          const info = ROLE_DESCRIPTIONS[role];
          const members = staffByRole.get(role) ?? [];
          return (
            <div key={role} className="flex flex-col gap-2">
              <RoleAccessForm
                role={role}
                label={info.label}
                blurb={info.blurb}
                flags={accessByRole[role]}
                memberCount={members.length}
              />
              {members.length > 0 ? (
                <ul className="-mt-1 flex flex-wrap gap-x-3 gap-y-1 px-1 text-xs text-[var(--bt-muted)]">
                  {members.map((member) => (
                    <li key={member.id}>
                      <Link href={`/staff/${member.id}`} className="hover:underline">
                        {member.name ?? member.email}
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          );
        })}

        <div className="rounded-lg border bg-[var(--bt-panel-bg)] p-4" style={{ borderColor: "var(--bt-border)" }}>
          <h2 className="text-sm font-semibold text-[var(--bt-primary)]">{ROLE_DESCRIPTIONS[UserRole.AGENT].label}</h2>
          <p className="mt-1 text-sm text-[var(--bt-text)]">{ROLE_DESCRIPTIONS[UserRole.AGENT].blurb}</p>
          <p className="mt-2 text-xs text-[var(--bt-muted)]">Agent site access is API-key scopes, not this matrix.</p>
        </div>
      </div>

      <p className="text-xs text-[var(--bt-muted)]">
        To change someone&apos;s role, visit their profile from{" "}
        <Link href="/staff" className="text-[var(--bt-primary)] hover:underline">
          Internal users
        </Link>
        .
      </p>
    </div>
  );
}
