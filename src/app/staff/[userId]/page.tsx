import { notFound } from "next/navigation";

import { SetupNotice } from "@/app/admin/setup-notice";
import { UserRole } from "@/generated/prisma/enums";
import { currentAppUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { isTransactionalEmailConfigured } from "@/lib/env";
import { formatDate } from "@/lib/format";
import { hasOrgWideJobAccess } from "@/lib/job-access";
import { ROLE_DESCRIPTIONS } from "@/lib/staff/role-descriptions";

import { revokeJobAccessAction } from "./actions";
import { EmailSignInButton } from "./email-signin-button";
import { JobAccessForm } from "./job-access-form";
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

  const [member, jobs] = await Promise.all([
    db.user.findFirst({
      where: { id: userId, organizationId: viewer.organizationId },
      include: { jobGrants: { include: { job: { select: { id: true, name: true } } } } },
    }),
    db.job.findMany({ where: { organizationId: viewer.organizationId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  if (!member) notFound();

  const roleInfo = ROLE_DESCRIPTIONS[member.role];
  const orgWideAccess = hasOrgWideJobAccess(member.role);
  const emailConfigured = isTransactionalEmailConfigured();

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

      <section className="rounded-lg border bg-[var(--bt-panel-bg)] p-4" style={{ borderColor: "var(--bt-border)" }}>
        <h2 className="text-sm font-semibold text-[var(--bt-text)]">Overview</h2>
        <div className="mt-3">
          <ProfileForm userId={member.id} name={member.name} title={member.title} phone={member.phone} />
        </div>
      </section>

      <section className="rounded-lg border bg-[var(--bt-panel-bg)] p-4" style={{ borderColor: "var(--bt-border)" }}>
        <h2 className="text-sm font-semibold text-[var(--bt-text)]">Permissions</h2>
        <p className="mt-2 text-sm text-[var(--bt-muted)]">
          <strong className="text-[var(--bt-text)]">{roleInfo.label} permissions</strong> — {roleInfo.blurb}
        </p>
        <div className="mt-3">
          <RoleForm userId={member.id} currentRole={member.role} />
        </div>
      </section>

      <section className="rounded-lg border bg-[var(--bt-panel-bg)] p-4" style={{ borderColor: "var(--bt-border)" }}>
        <h2 className="text-sm font-semibold text-[var(--bt-text)]">Job Access</h2>
        {orgWideAccess ? (
          <div className="mt-3 rounded border bg-[var(--bt-page-bg)] p-3" style={{ borderColor: "var(--bt-border)" }}>
            <p className="text-sm font-medium text-[var(--bt-text)]">Full access to all jobs by role</p>
            <p className="mt-1 text-xs text-[var(--bt-muted)]">
              {roleInfo.label} already sees every job (Buildertrend-style). Per-job grants are only for Field Crew — nothing to assign here.
            </p>
          </div>
        ) : member.role === UserRole.AGENT ? (
          <p className="mt-2 text-sm text-[var(--bt-muted)]">
            Agent accounts authenticate with API keys, not job grants. Scope their access on the API key, not here.
          </p>
        ) : (
          <>
            <p className="mt-1 text-xs text-[var(--bt-muted)]">
              Field crew only see jobs they&apos;re granted access to below — this is what actually controls it.
            </p>
            {member.jobGrants.length === 0 ? (
              <p className="mt-2 text-sm text-[var(--bt-muted)]">Not granted access to any specific job yet.</p>
            ) : (
              <ul className="mt-2 divide-y" style={{ borderColor: "var(--bt-border)" }}>
                {member.jobGrants.map((grant) => (
                  <li key={grant.id} className="flex flex-col gap-2 py-2 text-sm sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <span className="font-medium text-[var(--bt-text)]">{grant.job.name}</span>
                      <div className="text-xs text-[var(--bt-muted)]">
                        {grant.scheduleScope === "ALL_ITEMS" ? "All schedule items" : "Assigned items only"}
                        {grant.canViewPricing ? " · Pricing" : ""}
                        {grant.canViewCostDetail ? " · Cost detail" : ""}
                        {grant.canManageSchedule ? " · Manage schedule" : ""}
                        {grant.canApproveChangeOrders ? " · Approve change orders" : ""}
                        {grant.canCommunicateWithClient ? " · Communicate with client" : ""}
                      </div>
                    </div>
                    <form action={revokeJobAccessAction}>
                      <input type="hidden" name="userId" value={member.id} />
                      <input type="hidden" name="jobId" value={grant.job.id} />
                      <button type="submit" className="text-xs font-semibold text-red-600 hover:underline">
                        Revoke
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-3">
              <JobAccessForm userId={member.id} jobs={jobs} />
            </div>
          </>
        )}
      </section>

      <section className="rounded-lg border bg-[var(--bt-panel-bg)] p-4" style={{ borderColor: "var(--bt-border)" }}>
        <h2 className="text-sm font-semibold text-[var(--bt-text)]">Security & Login</h2>
        <p className="mt-1 text-xs text-[var(--bt-muted)]">
          Staff sign in with Clerk (Google / email) — WCI OS does not set a password. Pre-authorized emails get access on first matching sign-in.
        </p>
        <div className="mt-3 flex flex-col gap-4">
          <EmailSignInButton
            userId={member.id}
            email={member.email}
            emailConfigured={emailConfigured}
            alreadyLinked={Boolean(member.clerkUserId)}
          />
          <SecurityForm userId={member.id} isActive={member.isActive} />
        </div>
      </section>
    </div>
  );
}
