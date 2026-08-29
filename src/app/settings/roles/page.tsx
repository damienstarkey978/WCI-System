import Link from "next/link";

import { SetupNotice } from "@/app/admin/setup-notice";
import { UserRole } from "@/generated/prisma/enums";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { ROLE_DESCRIPTIONS } from "@/lib/staff/role-descriptions";

export const dynamic = "force-dynamic";

const ROLE_ORDER = [UserRole.ADMIN, UserRole.PM, UserRole.OFFICE, UserRole.FIELD, UserRole.AGENT] as const;

/**
 * "Role Management" (Buildertrend screenshot gap-analysis pass) — Buildertrend
 * shows its 8-9 standard roles with a one-line permission blurb each; we have 5
 * real roles (UserRole), so this shows those, reusing the same blurbs already
 * written for the staff directory's Permissions tab (src/lib/staff/role-descriptions.ts)
 * rather than inventing a second copy, plus which real staff currently hold each
 * one — Buildertrend's own page doesn't show that, but it's the more useful version
 * of "what does this role mean" than a static description alone.
 */
export default async function RoleManagementPage() {
  let admin;
  try {
    admin = await requireRole(UserRole.ADMIN);
  } catch (error) {
    return <SetupNotice detail={error instanceof Error ? error.message : String(error)} />;
  }

  const staff = await db.user.findMany({
    where: { organizationId: admin.organizationId, isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, email: true, role: true, agentKind: true },
  });

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
        <p className="text-sm text-[var(--bt-muted)]">What each role can do, and who currently holds it.</p>
      </div>

      <div className="flex flex-col gap-3">
        {ROLE_ORDER.map((role) => {
          const info = ROLE_DESCRIPTIONS[role];
          const members = staffByRole.get(role) ?? [];
          return (
            <div key={role} className="rounded-lg border bg-[var(--bt-panel-bg)] p-4" style={{ borderColor: "var(--bt-border)" }}>
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-[var(--bt-primary)]">{info.label}</h2>
                <span className="text-xs text-[var(--bt-muted)]">
                  {members.length} {members.length === 1 ? "person" : "people"}
                </span>
              </div>
              <p className="mt-1 text-sm text-[var(--bt-text)]">{info.blurb}</p>
              {members.length > 0 ? (
                <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--bt-muted)]">
                  {members.map((member) => (
                    <li key={member.id}>
                      {role === UserRole.AGENT ? (
                        <span>{member.agentKind ?? member.name ?? member.email}</span>
                      ) : (
                        <Link href={`/staff/${member.id}`} className="hover:underline">
                          {member.name ?? member.email}
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          );
        })}
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
