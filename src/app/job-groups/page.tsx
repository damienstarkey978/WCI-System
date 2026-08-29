import Link from "next/link";

import { SetupNotice } from "@/app/admin/setup-notice";
import { AppShell } from "@/components/shell/AppShell";
import { notificationBellDataForUser, sidebarJobsForOrg } from "@/components/shell/data";
import { UserRole } from "@/generated/prisma/enums";
import { currentAppUserOrRedirect } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/format";
import { getWipReport } from "@/lib/reports/service";

export const dynamic = "force-dynamic";

/**
 * Job Group rollup (CLAUDE.md 3's multi-family/multi-job rollup view) — a thin
 * aggregation over the same per-job WIP rows the Reports tab computes, bucketed
 * by JobGroup, so a group's totals can never disagree with a member job's own
 * numbers. Deliberately independent of any Airtable data — it only needs
 * Job.jobGroupId, which already exists.
 */
export default async function JobGroupsPage() {
  let user;
  try {
    user = await currentAppUserOrRedirect();
  } catch (error) {
    return <SetupNotice detail={error instanceof Error ? error.message : String(error)} />;
  }
  if (user.role === UserRole.FIELD) {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
          Job Groups show company-wide financials, which your role doesn&apos;t have access to.
        </div>
      </div>
    );
  }

  const [jobs, bell, groups, jobRows, wipRows] = await Promise.all([
    sidebarJobsForOrg(user.organizationId, user),
    notificationBellDataForUser(user.organizationId, user.id),
    db.jobGroup.findMany({ where: { organizationId: user.organizationId }, orderBy: { name: "asc" } }),
    db.job.findMany({ where: { organizationId: user.organizationId, isTemplate: false }, select: { id: true, jobGroupId: true } }),
    getWipReport(user.organizationId),
  ]);

  const wipByJobId = new Map(wipRows.map((row) => [row.jobId, row]));
  const ungroupedCount = jobRows.filter((job) => job.jobGroupId === null).length;

  const rollups = groups.map((group) => {
    const memberJobIds = jobRows.filter((job) => job.jobGroupId === group.id).map((job) => job.id);
    const rows = memberJobIds.map((id) => wipByJobId.get(id)).filter((row) => row !== undefined);
    return {
      group,
      jobCount: memberJobIds.length,
      activeJobCount: rows.length,
      totalContractValueCents: rows.reduce((sum, row) => sum + row.revisedClientPriceCents, 0),
      totalEarnedRevenueCents: rows.reduce((sum, row) => sum + row.earnedRevenueCents, 0),
    };
  });

  return (
    <AppShell jobs={jobs} notifications={bell.notifications} unreadCount={bell.unreadCount}>
      <div className="mx-auto flex max-w-5xl flex-col gap-4 p-6">
        <h1 className="text-xl font-semibold text-[var(--bt-text)]">Job Groups</h1>

        {rollups.length === 0 ? (
          <p className="rounded-lg border bg-white px-4 py-6 text-center text-sm text-[var(--bt-muted)]" style={{ borderColor: "var(--bt-border)" }}>
            No job groups yet — group jobs (e.g. units in a multi-family build) from a job&apos;s settings.
          </p>
        ) : (
          <div className="overflow-hidden rounded-lg border bg-white" style={{ borderColor: "var(--bt-border)" }}>
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b text-xs font-semibold uppercase tracking-wide text-[var(--bt-muted)]" style={{ borderColor: "var(--bt-border)" }}>
                  <th className="px-4 py-3">Group</th>
                  <th className="px-4 py-3 text-right">Jobs</th>
                  <th className="px-4 py-3 text-right">Contract value</th>
                  <th className="px-4 py-3 text-right">Earned revenue</th>
                </tr>
              </thead>
              <tbody>
                {rollups.map((rollup) => (
                  <tr key={rollup.group.id} className="border-b last:border-0" style={{ borderColor: "var(--bt-border)" }}>
                    <td className="px-4 py-3">
                      <Link href={`/job-groups/${rollup.group.id}`} className="font-medium text-[var(--bt-primary)] hover:underline">
                        {rollup.group.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-right text-[var(--bt-text)]">{rollup.jobCount}</td>
                    <td className="px-4 py-3 text-right text-[var(--bt-text)]">{formatMoney(rollup.totalContractValueCents)}</td>
                    <td className="px-4 py-3 text-right text-[var(--bt-text)]">{formatMoney(rollup.totalEarnedRevenueCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {ungroupedCount > 0 ? (
          <p className="text-xs text-[var(--bt-muted)]">{ungroupedCount} job(s) aren&apos;t in a group yet.</p>
        ) : null}
      </div>
    </AppShell>
  );
}
