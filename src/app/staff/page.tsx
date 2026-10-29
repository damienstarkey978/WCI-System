import Link from "next/link";

import { SetupNotice } from "@/app/admin/setup-notice";
import { DirectoryHeader } from "@/components/directory/directory-controls";
import { DirectoryTable, type DirectoryColumn } from "@/components/directory/directory-table";
import { UserRole } from "@/generated/prisma/enums";
import { currentAppUser } from "@/lib/auth";
import { parseDirectoryParams } from "@/lib/directory/params";
import { isTransactionalEmailConfigured } from "@/lib/env";
import { ROLE_DESCRIPTIONS } from "@/lib/staff/role-descriptions";
import { listStaffMembers } from "@/lib/staff/service";

import { InviteStaffForm } from "./invite-staff-form";
import { SendInviteButton } from "./send-invite-button";

export const dynamic = "force-dynamic";

type StaffRow = Awaited<ReturnType<typeof listStaffMembers>>[number];

const BADGE = "inline-block rounded px-2 py-0.5 text-xs font-bold tracking-wide";

function loginBadge(member: StaffRow) {
  if (!member.isActive) return <span className={`${BADGE} bg-gray-200 text-gray-700 dark:bg-white/10 dark:text-gray-300`}>INACTIVE</span>;
  if (member.clerkUserId) return <span className={`${BADGE} bg-green-100 text-green-800 dark:bg-green-400/15 dark:text-green-300`}>ACTIVE</span>;
  return <span className={`${BADGE} bg-amber-100 text-amber-800 dark:bg-amber-400/15 dark:text-amber-300`}>PENDING</span>;
}

/** Company settings (/settings/company) are admin-only everywhere else in the app, so this column just reflects the role. */
function companySettingsBadge(member: StaffRow) {
  return member.role === UserRole.ADMIN ? (
    <span className={`${BADGE} bg-green-100 text-green-800 dark:bg-green-400/15 dark:text-green-300`}>ACCESS</span>
  ) : (
    <span className={`${BADGE} bg-red-100 text-red-700 dark:bg-red-400/15 dark:text-red-300`}>NO ACCESS</span>
  );
}

/**
 * Buildertrend-style "Internal Users" directory. Everyone signed in can see the team
 * (the old People page already showed it read-only); only admins get the + Internal
 * user button and links into a member's account — that's the screen that actually
 * performs invites, role changes and deactivation (unlike Jarvis's confirm-gated tools,
 * a human is already explicitly inside an admin-only screen there).
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

  const isAdmin = user.role === UserRole.ADMIN;
  const emailConfigured = isTransactionalEmailConfigured();
  const staff = [...(await listStaffMembers(user.organizationId))].sort((a, b) => {
    if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
    return (a.name ?? a.email).toLowerCase().localeCompare((b.name ?? b.email).toLowerCase());
  });

  const columns: readonly DirectoryColumn<StaffRow>[] = [
    {
      key: "name",
      label: "Name",
      render: (member) =>
        isAdmin ? (
          <Link href={`/staff/${member.id}`} className="font-medium text-[var(--bt-primary)] hover:underline">
            {member.name ?? member.email}
          </Link>
        ) : (
          <span className="font-medium">{member.name ?? member.email}</span>
        ),
    },
    { key: "role", label: "Role", render: (member) => member.title ?? ROLE_DESCRIPTIONS[member.role].label },
    { key: "companySettings", label: "Company Settings", render: companySettingsBadge },
    {
      key: "login",
      label: "Login",
      render: (member) => (
        <div className="flex flex-wrap items-center gap-2">
          {loginBadge(member)}
          {isAdmin && !member.isActive ? (
            <SendInviteButton userId={member.id} email={member.email} emailConfigured={emailConfigured} />
          ) : null}
        </div>
      ),
    },
    { key: "email", label: "Email", render: (member) => member.email },
    {
      key: "phone",
      label: "Phone",
      render: (member) =>
        member.phone ? (
          <a href={`tel:${member.phone.replace(/[^\d+]/g, "")}`} className="whitespace-nowrap text-[var(--bt-primary)] hover:underline">
            {member.phone}
          </a>
        ) : null,
    },
  ];

  return (
    <div className="mx-auto flex max-w-[110rem] flex-col gap-4 p-6">
      <DirectoryHeader
        title="Internal Users"
        panels={isAdmin ? [{ id: "invite", label: "Internal user", variant: "primary", content: <InviteStaffForm /> }] : []}
      />

      <DirectoryTable basePath="/staff" params={parseDirectoryParams({}, [])} columns={columns} rows={staff} rowKey={(member) => member.id} emptyMessage="No internal users yet." />

      <p className="text-right text-sm text-[var(--bt-text)]">
        {staff.length === 0 ? 0 : 1}-{staff.length} of {staff.length} items
      </p>
    </div>
  );
}
