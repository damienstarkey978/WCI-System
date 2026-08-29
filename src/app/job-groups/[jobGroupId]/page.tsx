import Link from "next/link";
import { notFound } from "next/navigation";

import { SetupNotice } from "@/app/admin/setup-notice";
import { AppShell } from "@/components/shell/AppShell";
import { notificationBellDataForUser, sidebarJobsForOrg } from "@/components/shell/data";
import { UserRole } from "@/generated/prisma/enums";
import { currentAppUserOrRedirect } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatMoney, formatPercent } from "@/lib/format";
import { getProfitabilityReport, getWipReport } from "@/lib/reports/service";

export const dynamic = "force-dynamic";

export default async function JobGroupDetailPage({ params }: PageProps<"/job-groups/[jobGroupId]">) {
  const { jobGroupId } = await params;

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

  const group = await db.jobGroup.findFirst({ where: { id: jobGroupId, organizationId: user.organizationId } });
  if (!group) notFound();

  const [jobs, bell, wipRows, profitabilityRows] = await Promise.all([
    sidebarJobsForOrg(user.organizationId, user),
    notificationBellDataForUser(user.organizationId, user.id),
    getWipReport(user.organizationId, group.id),
    getProfitabilityReport(user.organizationId, group.id),
  ]);

  const profitByJobId = new Map(profitabilityRows.map((row) => [row.jobId, row]));
  const totalContractValueCents = wipRows.reduce((sum, row) => sum + row.revisedClientPriceCents, 0);
  const totalEarnedRevenueCents = wipRows.reduce((sum, row) => sum + row.earnedRevenueCents, 0);
  const totalProjectedProfitCents = profitabilityRows.reduce((sum, row) => sum + row.projectedProfitCents, 0);

  return (
    <AppShell jobs={jobs} notifications={bell.notifications} unreadCount={bell.unreadCount}>
      <div className="mx-auto flex max-w-5xl flex-col gap-4 p-6">
        <div>
          <Link href="/job-groups" className="text-xs text-[var(--bt-muted)] hover:underline">
            ← All job groups
          </Link>
          <h1 className="mt-1 text-xl font-semibold text-[var(--bt-text)]">{group.name}</h1>
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-lg border bg-white p-4" style={{ borderColor: "var(--bt-border)" }}>
            <div className="text-xs font-semibold uppercase tracking-wide text-[var(--bt-muted)]">Active jobs</div>
            <div className="mt-1 text-2xl font-semibold text-[var(--bt-text)]">{wipRows.length}</div>
          </div>
          <div className="rounded-lg border bg-white p-4" style={{ borderColor: "var(--bt-border)" }}>
            <div className="text-xs font-semibold uppercase tracking-wide text-[var(--bt-muted)]">Total contract value</div>
            <div className="mt-1 text-2xl font-semibold text-[var(--bt-text)]">{formatMoney(totalContractValueCents)}</div>
          </div>
          <div className="rounded-lg border bg-white p-4" style={{ borderColor: "var(--bt-border)" }}>
            <div className="text-xs font-semibold uppercase tracking-wide text-[var(--bt-muted)]">Earned revenue</div>
            <div className="mt-1 text-2xl font-semibold text-[var(--bt-text)]">{formatMoney(totalEarnedRevenueCents)}</div>
          </div>
          <div className="rounded-lg border bg-white p-4" style={{ borderColor: "var(--bt-border)" }}>
            <div className="text-xs font-semibold uppercase tracking-wide text-[var(--bt-muted)]">Projected profit</div>
            <div className="mt-1 text-2xl font-semibold text-[var(--bt-text)]">{formatMoney(totalProjectedProfitCents)}</div>
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border bg-white" style={{ borderColor: "var(--bt-border)" }}>
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b text-xs font-semibold uppercase tracking-wide text-[var(--bt-muted)]" style={{ borderColor: "var(--bt-border)" }}>
                <th className="px-4 py-3">Job</th>
                <th className="px-4 py-3 text-right">Contract price</th>
                <th className="px-4 py-3 text-right">% complete</th>
                <th className="px-4 py-3 text-right">Earned revenue</th>
                <th className="px-4 py-3 text-right">Projected margin</th>
              </tr>
            </thead>
            <tbody>
              {wipRows.map((row) => {
                const profit = profitByJobId.get(row.jobId);
                return (
                  <tr key={row.jobId} className="border-b last:border-0" style={{ borderColor: "var(--bt-border)" }}>
                    <td className="px-4 py-3">
                      <Link href={`/jobs/${row.jobId}`} className="font-medium text-[var(--bt-primary)] hover:underline">
                        {row.jobName}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-right text-[var(--bt-text)]">{formatMoney(row.revisedClientPriceCents)}</td>
                    <td className="px-4 py-3 text-right text-[var(--bt-text)]">{formatPercent(row.percentCompleteBasisPoints)}</td>
                    <td className="px-4 py-3 text-right text-[var(--bt-text)]">{formatMoney(row.earnedRevenueCents)}</td>
                    <td className="px-4 py-3 text-right text-[var(--bt-text)]">
                      {profit ? formatPercent(profit.projectedMarginBasisPoints) : "—"}
                    </td>
                  </tr>
                );
              })}
              {wipRows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-[var(--bt-muted)]">
                    No active jobs in this group.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}
