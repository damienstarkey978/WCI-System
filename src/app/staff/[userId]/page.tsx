import { notFound } from "next/navigation";

import { SetupNotice } from "@/app/admin/setup-notice";
import { UserRole } from "@/generated/prisma/enums";
import { currentAppUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { ROLE_DESCRIPTIONS } from "@/lib/staff/role-descriptions";

import { ProfileForm } from "./profile-form";
import { RoleForm } from "./role-form";
import { SecurityForm } from "./security-form";

export const dynamic = "force-dynamic";

export default async function StaffMemberPage({ params }: PageProps<"/staff/[userId]">) {
  const { userId } = await params;

  let viewer;
  try {
    viewer = await currentAppUser();
  } catch (error) {
    return <SetupNotice detail={error instanceof Error ? error.message : String(error)} />;
  }
  if (!viewer) {
    return <SetupNotice detail="No organization found. Seed the database, then reload." />;
  }
  if (viewer.role !== UserRole.ADMIN) {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
          Only an admin can manage staff accounts.
        </div>
      </div>
    );
  }

  const member = await db.user.findFirst({
    where: { id: userId, organizationId: viewer.organizationId },
    include: { jobGrants: { include: { job: { select: { id: true, name: true } } } } },
  });
  if (!member) notFound();

  const roleInfo = ROLE_DESCRIPTIONS[member.role];

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4 p-6">
      <div>
        <h1 className="text-xl font-semibold text-[var(--bt-text)]">{member.name ?? member.email}</h1>
        <p className="text-sm text-[var(--bt-muted)]">
          {member.email}
          {member.phone ? ` · ${member.phone}` : ""}
        </p>
        <p className="mt-1 text-xs text-[var(--bt-muted)]">
          {member.clerkUserId
            ? `Signed in and linked ${formatDate(member.updatedAt)}`
            : member.isActive
              ? "Pre-authorized — hasn't signed in yet"
              : "Deactivated"}
        </p>
      </div>

      <section className="rounded-lg border bg-white p-4" style={{ borderColor: "var(--bt-border)" }}>
        <h2 className="text-sm font-semibold text-[var(--bt-text)]">Overview</h2>
        <div className="mt-3">
          <ProfileForm userId={member.id} name={member.name} title={member.title} phone={member.phone} />
        </div>
      </section>

      <section className="rounded-lg border bg-white p-4" style={{ borderColor: "var(--bt-border)" }}>
        <h2 className="text-sm font-semibold text-[var(--bt-text)]">Permissions</h2>
        <p className="mt-2 text-sm text-[var(--bt-muted)]">
          <strong className="text-[var(--bt-text)]">{roleInfo.label} permissions</strong> — {roleInfo.blurb}
        </p>
        <div className="mt-3">
          <RoleForm userId={member.id} currentRole={member.role} />
        </div>
      </section>

      <section className="rounded-lg border bg-white p-4" style={{ borderColor: "var(--bt-border)" }}>
        <h2 className="text-sm font-semibold text-[var(--bt-text)]">Job Access ({member.jobGrants.length})</h2>
        {member.jobGrants.length === 0 ? (
          <p className="mt-2 text-sm text-[var(--bt-muted)]">
            No per-job access grants — {roleInfo.label.toLowerCase()} visibility is governed by their role above, not a per-job list.
          </p>
        ) : (
          <ul className="mt-2 divide-y" style={{ borderColor: "var(--bt-border)" }}>
            {member.jobGrants.map((grant) => (
              <li key={grant.id} className="flex items-center justify-between py-2 text-sm">
                <span className="font-medium text-[var(--bt-text)]">{grant.job.name}</span>
                <span className="text-xs text-[var(--bt-muted)]">{grant.scheduleScope === "ALL_ITEMS" ? "All schedule items" : "Assigned items only"}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-lg border bg-white p-4" style={{ borderColor: "var(--bt-border)" }}>
        <h2 className="text-sm font-semibold text-[var(--bt-text)]">Security & Login</h2>
        <div className="mt-3">
          <SecurityForm userId={member.id} isActive={member.isActive} />
        </div>
      </section>
    </div>
  );
}
