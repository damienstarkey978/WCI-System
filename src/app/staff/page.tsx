import Link from "next/link";

import { SetupNotice } from "@/app/admin/setup-notice";
import { UserRole } from "@/generated/prisma/enums";
import { currentAppUser } from "@/lib/auth";
import { ROLE_DESCRIPTIONS } from "@/lib/staff/role-descriptions";
import { listStaffMembers } from "@/lib/staff/service";

import { InviteStaffForm } from "./invite-staff-form";

export const dynamic = "force-dynamic";

function loginStatus(member: { clerkUserId: string | null; isActive: boolean }): { label: string; className: string } {
  if (!member.isActive) return { label: "INACTIVE", className: "text-[var(--bt-muted)]" };
  if (member.clerkUserId) return { label: "ACTIVE", className: "text-emerald-700" };
  return { label: "PENDING", className: "text-amber-700" };
}

/**
 * Buildertrend-style "Internal Users" directory. Gated to admins — this is the
 * screen that actually performs staff invites/role changes/deactivation
 * directly (unlike Jarvis's confirm-gated tools, a human is already explicitly
 * inside an admin-only screen here).
 */
export default async function StaffPage() {
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
          Only an admin can manage staff accounts. Ask an admin to make changes here.
        </div>
      </div>
    );
  }

  const staff = await listStaffMembers(user.organizationId);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 p-6">
      <div>
        <h1 className="text-xl font-semibold text-[var(--bt-text)]">Internal Users</h1>
        <p className="text-sm text-[var(--bt-muted)]">Your team&apos;s accounts, roles, and login status.</p>
      </div>

      <InviteStaffForm />

      <div className="overflow-hidden rounded-lg border bg-[var(--bt-panel-bg)]" style={{ borderColor: "var(--bt-border)" }}>
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b text-xs font-semibold uppercase tracking-wide text-[var(--bt-muted)]" style={{ borderColor: "var(--bt-border)" }}>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Login</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Phone</th>
            </tr>
          </thead>
          <tbody>
            {staff.map((member) => {
              const status = loginStatus(member);
              return (
                <tr key={member.id} className="border-b last:border-0" style={{ borderColor: "var(--bt-border)" }}>
                  <td className="px-4 py-3">
                    <Link href={`/staff/${member.id}`} className="font-medium text-[var(--bt-primary)] hover:underline">
                      {member.name ?? member.email}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-[var(--bt-muted)]">{member.title ?? ROLE_DESCRIPTIONS[member.role].label}</td>
                  <td className={`px-4 py-3 text-xs font-semibold ${status.className}`}>{status.label}</td>
                  <td className="px-4 py-3 text-[var(--bt-muted)]">{member.email}</td>
                  <td className="px-4 py-3 text-[var(--bt-muted)]">{member.phone ?? "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
