import Link from "next/link";

import { AppShell } from "@/components/shell/AppShell";
import { notificationBellDataForUser, sidebarJobsForOrg } from "@/components/shell/data";
import { EmptyState } from "@/components/shell/EmptyState";
import { CalendarIcon } from "@/components/shell/icons";
import { SetupNotice } from "@/app/admin/setup-notice";
import { currentAppUserOrRedirect } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { workedHours } from "@/lib/time-clock/hours";

export const dynamic = "force-dynamic";

/**
 * Org-wide Time Clock — every recent shift across jobs. Per-job clock-in still
 * lives under /jobs/{id}/time-clock; this is the global route Heather expected.
 */
export default async function GlobalTimeClockPage({ searchParams }: PageProps<"/time-clock">) {
  let user;
  try {
    user = await currentAppUserOrRedirect();
  } catch (error) {
    return <SetupNotice detail={error instanceof Error ? error.message : String(error)} />;
  }

  const { tab: tabParam } = await searchParams;
  const tab = tabParam === "pending" ? "pending" : tabParam === "open" ? "open" : "all";

  const [jobs, bell, entries, openEntries] = await Promise.all([
    sidebarJobsForOrg(user.organizationId, user),
    notificationBellDataForUser(user.organizationId, user.id),
    db.timeClockEntry.findMany({
      where: {
        organizationId: user.organizationId,
        ...(tab === "pending" ? { approvalStatus: "PENDING" as const, clockOutAt: { not: null } } : {}),
        ...(tab === "open" ? { clockOutAt: null } : {}),
      },
      orderBy: { clockInAt: "desc" },
      take: 200,
      include: {
        user: { select: { name: true, email: true } },
        costCode: { select: { code: true, name: true } },
        job: { select: { id: true, name: true, prefix: true } },
        breaks: true,
      },
    }),
    db.timeClockEntry.findMany({
      where: { organizationId: user.organizationId, clockOutAt: null },
      include: { user: { select: { name: true, email: true } }, job: { select: { name: true, prefix: true } } },
    }),
  ]);

  const asOf = new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const tabs = [
    { key: "all", label: "All shifts", href: "/time-clock" },
    { key: "open", label: "Clocked in", href: "/time-clock?tab=open" },
    { key: "pending", label: "Needs approval", href: "/time-clock?tab=pending" },
  ] as const;

  return (
    <AppShell jobs={jobs} notifications={bell.notifications} unreadCount={bell.unreadCount}>
      <div className="mx-auto flex max-w-6xl flex-col gap-4 p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-[var(--bt-text)]">Time Clock</h1>
            <p className="mt-0.5 text-sm text-[var(--bt-muted)]">Shifts across every job. Clock in from a job page or the field app.</p>
          </div>
          <Link href="/field/time-clock" className="rounded border px-3 py-2 text-sm font-semibold" style={{ borderColor: "var(--bt-border)" }}>
            Field app
          </Link>
        </div>

        <nav className="flex gap-1 border-b" style={{ borderColor: "var(--bt-border)" }}>
          {tabs.map((t) => (
            <Link
              key={t.key}
              href={t.href}
              className="-mb-px border-b-2 px-3 py-2 text-sm font-medium transition"
              style={{ borderColor: t.key === tab ? "var(--bt-primary)" : "transparent", color: t.key === tab ? "var(--bt-primary)" : "var(--bt-muted)" }}
            >
              {t.label}
            </Link>
          ))}
        </nav>

        <div className="rounded-lg border bg-[var(--bt-panel-bg)] p-3 text-sm text-[var(--bt-muted)]" style={{ borderColor: "var(--bt-border)" }}>
          {openEntries.length === 0
            ? `No users clocked in as of ${asOf}.`
            : `${openEntries.length} user${openEntries.length === 1 ? "" : "s"} clocked in: ${openEntries
                .map((entry) => `${entry.user.name || entry.user.email} (${entry.job.prefix ? `${entry.job.prefix} ` : ""}${entry.job.name})`)
                .join(", ")}.`}
        </div>

        {entries.length === 0 ? (
          <EmptyState
            icon={<CalendarIcon className="h-10 w-10" />}
            title="No shifts yet"
            description="Open a job's Time Clock page or the field app to clock in."
          />
        ) : (
          <div className="overflow-x-auto rounded-lg border bg-[var(--bt-panel-bg)]" style={{ borderColor: "var(--bt-border)" }}>
            <table className="w-full min-w-max text-left text-sm">
              <thead>
                <tr className="border-b text-xs font-semibold uppercase tracking-wide text-[var(--bt-muted)]" style={{ borderColor: "var(--bt-border)" }}>
                  <th className="px-4 py-3">Worker</th>
                  <th className="px-4 py-3">Job</th>
                  <th className="px-4 py-3">Cost code</th>
                  <th className="px-4 py-3">Clock in</th>
                  <th className="px-4 py-3">Hours</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id} className="border-b last:border-0" style={{ borderColor: "var(--bt-border)" }}>
                    <td className="px-4 py-2">{entry.user.name || entry.user.email}</td>
                    <td className="px-4 py-2">
                      <Link href={`/jobs/${entry.job.id}/time-clock`} className="text-[var(--bt-primary)] hover:underline">
                        {entry.job.prefix ? `${entry.job.prefix} ` : ""}
                        {entry.job.name}
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-[var(--bt-muted)]">
                      {entry.costCode.code} {entry.costCode.name}
                    </td>
                    <td className="px-4 py-2 text-[var(--bt-muted)]">{formatDate(entry.clockInAt)}</td>
                    <td className="px-4 py-2">
                      {entry.clockOutAt ? workedHours(entry.clockInAt, entry.clockOutAt, entry.breaks).toFixed(2) : <span className="text-[var(--bt-muted)]">In progress</span>}
                    </td>
                    <td className="px-4 py-2 text-[var(--bt-muted)]">{entry.approvalStatus}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppShell>
  );
}
