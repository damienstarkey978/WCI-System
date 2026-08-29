import Link from "next/link";
import { notFound } from "next/navigation";

import { UserRole } from "@/generated/prisma/enums";
import { currentAppUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate, formatMoney } from "@/lib/format";
import { getComputedSchedule } from "@/lib/scheduling/service";
import { SetupNotice } from "@/app/admin/setup-notice";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  PRE_SALE: "Pre-sale",
  OPEN: "Open",
  WARRANTY: "Warranty",
  CLOSED: "Closed",
};

const MS_PER_DAY = 86_400_000;
const DAY_NAME = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "")).toUpperCase() || "?";
}

function Avatar({ label }: { label: string }) {
  return (
    <div
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
      style={{ background: "var(--bt-status-open-bg)", color: "var(--bt-status-open-text)" }}
      title={label}
    >
      {initials(label)}
    </div>
  );
}

interface ActivityEntry {
  readonly id: string;
  readonly description: string;
  readonly actorLabel: string | null;
  readonly createdAt: Date;
  readonly href: string;
}

/**
 * "Job Info" (per Damien's screenshot, 2026-08-29) — the landing page for a selected
 * job, reached from the sidebar or the Jobs > Job Info menu item. Every number here
 * is a real query against this job's own data; nothing is a static mockup value.
 * "Recent activity" has no dedicated audit-log table to read from (Comment is a
 * discussion thread, not a change feed), so it's assembled by merging each record
 * type's own createdAt across Invoices/Daily Logs/Change Orders — real events, just
 * not from one unified feed the way a proper activity log would give you.
 */
export default async function JobOverviewPage({ params }: PageProps<"/jobs/[jobId]">) {
  const { jobId } = await params;

  let user;
  try {
    user = await currentAppUser();
  } catch (error) {
    return <SetupNotice detail={error instanceof Error ? error.message : String(error)} />;
  }
  if (!user) {
    return <SetupNotice detail="No organization found. Seed the database, then reload." />;
  }

  const job = await db.job.findFirst({
    where: { id: jobId, organizationId: user.organizationId },
    include: {
      clientAccess: { include: { client: true } },
      accessGrants: { include: { user: true } },
    },
  });
  if (!job) notFound();

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfToday = new Date(startOfToday.getTime() + MS_PER_DAY);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [
    clockedInCount,
    overdueInvoices,
    dueTodayTodos,
    unapprovedShifts,
    pendingChangeOrders,
    clientUpdateCount,
    recentInvoices,
    recentDailyLogs,
    recentChangeOrders,
    scheduleRow,
  ] = await Promise.all([
    db.timeClockEntry.count({ where: { jobId: job.id, clockOutAt: null } }),
    db.invoice.findMany({
      where: { jobId: job.id, status: { in: ["SENT", "PARTIALLY_PAID"] }, dueOn: { lt: now } },
      select: { id: true },
    }),
    db.todo.findMany({
      where: { jobId: job.id, status: { in: ["OPEN", "IN_PROGRESS"] }, dueDate: { gte: startOfToday, lt: endOfToday } },
      orderBy: { dueDate: "asc" },
    }),
    db.timeClockEntry.count({ where: { jobId: job.id, approvalStatus: "PENDING" } }),
    db.changeOrder.count({ where: { jobId: job.id, status: "PENDING_APPROVAL" } }),
    db.clientUpdateSummary.count({ where: { jobId: job.id, createdAt: { gte: startOfMonth } } }),
    db.invoice.findMany({ where: { jobId: job.id }, orderBy: { createdAt: "desc" }, take: 5 }),
    db.dailyLog.findMany({ where: { jobId: job.id }, orderBy: { createdAt: "desc" }, take: 5, include: { authorUser: true } }),
    db.changeOrder.findMany({ where: { jobId: job.id }, orderBy: { createdAt: "desc" }, take: 5 }),
    db.schedule.findFirst({ where: { jobId: job.id, organizationId: user.organizationId }, orderBy: { createdAt: "asc" } }),
  ]);

  const projectManagers = job.accessGrants.map((grant) => grant.user).filter((grantUser) => grantUser.role === UserRole.PM);

  const activity: ActivityEntry[] = [
    ...recentInvoices.map((invoice) => ({
      id: `invoice-${invoice.id}`,
      description: `New invoice ${invoice.invoiceNumber} (${formatMoney(invoice.amountCents)})`,
      actorLabel: null,
      createdAt: invoice.createdAt,
      href: `/jobs/${job.id}/invoices/${invoice.id}`,
    })),
    ...recentDailyLogs.map((log) => ({
      id: `dailylog-${log.id}`,
      description: `Daily log: ${log.note.slice(0, 80)}${log.note.length > 80 ? "…" : ""}`,
      actorLabel: log.authorUser.name ?? log.authorUser.email,
      createdAt: log.createdAt,
      href: `/jobs/${job.id}/daily-logs`,
    })),
    ...recentChangeOrders.map((co) => ({
      id: `co-${co.id}`,
      description: `Change order created: ${co.title}`,
      actorLabel: null,
      createdAt: co.createdAt,
      href: `/jobs/${job.id}/change-orders`,
    })),
  ]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 8);

  const activityByDay = new Map<string, ActivityEntry[]>();
  for (const entry of activity) {
    const key = formatDate(entry.createdAt);
    const bucket = activityByDay.get(key) ?? [];
    bucket.push(entry);
    activityByDay.set(key, bucket);
  }

  let agendaDays: { label: string; items: readonly { title: string; href: string }[]; isWorkday: boolean }[] = [];
  if (scheduleRow) {
    const computed = await getComputedSchedule(user.organizationId, scheduleRow.id);
    agendaDays = Array.from({ length: 7 }, (_, offset) => {
      const day = new Date(startOfToday.getTime() + offset * MS_PER_DAY);
      const dayEnd = new Date(day.getTime() + MS_PER_DAY);
      const items = computed.items
        .filter((item) => item.startDate < dayEnd && item.endDate >= day)
        .map((item) => ({ title: item.title, href: `/jobs/${job.id}/schedule` }));
      const isWorkday = day.getDay() !== 0 && day.getDay() !== 6;
      return {
        label: `${DAY_NAME[day.getDay()]} · ${day.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`,
        items,
        isWorkday,
      };
    });
  }

  const address = [job.addressLine1, job.city, job.state, job.postalCode].filter(Boolean).join(", ");

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 p-6">
      <div className="rounded-lg border bg-[var(--bt-panel-bg)] p-5" style={{ borderColor: "var(--bt-border)" }}>
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold text-[var(--bt-text)]">{job.name}</h1>
          <span
            className="rounded px-1.5 py-0.5 text-xs font-semibold"
            style={{ background: "var(--bt-status-open-bg)", color: "var(--bt-status-open-text)" }}
          >
            {STATUS_LABEL[job.status] ?? job.status}
          </span>
        </div>
        {address ? (
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`}
            target="_blank"
            rel="noreferrer"
            className="mt-1 inline-block text-sm text-[var(--bt-primary)] hover:underline"
          >
            {address}
          </a>
        ) : null}

        <p className="mt-3 text-sm text-[var(--bt-text)]">
          {clockedInCount} internal user{clockedInCount === 1 ? "" : "s"} clocked in as of{" "}
          {now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
        </p>
        <Link href={`/jobs/${job.id}/time-clock`} className="text-sm text-[var(--bt-primary)] hover:underline">
          View time sheets
        </Link>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--bt-muted)]">Clients</h2>
            <div className="mt-1.5 flex items-center gap-1.5">
              {job.clientAccess.map((access) => (
                <Avatar key={access.id} label={access.client.name} />
              ))}
              <Link
                href="/clients"
                aria-label="Add a client"
                className="flex h-9 w-9 items-center justify-center rounded-full border text-lg text-[var(--bt-muted)] hover:bg-black/5"
                style={{ borderColor: "var(--bt-border)" }}
              >
                +
              </Link>
            </div>
          </div>
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--bt-muted)]">Project Managers</h2>
            <div className="mt-1.5 flex items-center gap-1.5">
              {projectManagers.map((pm) => (
                <Avatar key={pm.id} label={pm.name ?? pm.email} />
              ))}
              <Link
                href="/staff"
                aria-label="Assign a project manager"
                className="flex h-9 w-9 items-center justify-center rounded-full border text-lg text-[var(--bt-muted)] hover:bg-black/5"
                style={{ borderColor: "var(--bt-border)" }}
              >
                +
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <section className="rounded-lg border bg-[var(--bt-panel-bg)] p-4" style={{ borderColor: "var(--bt-border)" }}>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--bt-muted)]">Past due for you</h2>
          <div className="mt-2 text-sm">
            {overdueInvoices.length > 0 ? (
              <Link href={`/jobs/${job.id}/invoices`} className="font-medium text-[var(--bt-primary)] hover:underline">
                Invoices ({overdueInvoices.length})
              </Link>
            ) : (
              <p className="text-[var(--bt-muted)]">Nothing past due.</p>
            )}
          </div>
        </section>

        <section className="rounded-lg border bg-[var(--bt-panel-bg)] p-4" style={{ borderColor: "var(--bt-border)" }}>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--bt-muted)]">Due today</h2>
          <div className="mt-2 text-sm">
            {dueTodayTodos.length > 0 ? (
              <ul className="flex flex-col gap-1">
                {dueTodayTodos.map((todo) => (
                  <li key={todo.id}>
                    <Link href={`/jobs/${job.id}/tasks`} className="text-[var(--bt-primary)] hover:underline">
                      {todo.title}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[var(--bt-muted)]">You have nothing due today.</p>
            )}
          </div>
        </section>

        <section className="rounded-lg border bg-[var(--bt-panel-bg)] p-4" style={{ borderColor: "var(--bt-border)" }}>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--bt-muted)]">Action items</h2>
          <div className="mt-2 flex flex-col gap-1 text-sm">
            {unapprovedShifts === 0 && pendingChangeOrders === 0 ? (
              <p className="text-[var(--bt-muted)]">Nothing requires your attention at the moment.</p>
            ) : (
              <>
                {unapprovedShifts > 0 ? (
                  <Link href={`/jobs/${job.id}/time-clock`} className="text-[var(--bt-primary)] hover:underline">
                    {unapprovedShifts} unapproved {unapprovedShifts === 1 ? "shift" : "shifts"}
                  </Link>
                ) : null}
                {pendingChangeOrders > 0 ? (
                  <Link href={`/jobs/${job.id}/change-orders`} className="text-[var(--bt-primary)] hover:underline">
                    {pendingChangeOrders} change order{pendingChangeOrders === 1 ? "" : "s"} pending approval
                  </Link>
                ) : null}
              </>
            )}
          </div>
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="rounded-lg border bg-[var(--bt-panel-bg)] lg:col-span-2" style={{ borderColor: "var(--bt-border)" }}>
          <header className="border-b px-4 py-3" style={{ borderColor: "var(--bt-border)" }}>
            <h2 className="text-sm font-semibold text-[var(--bt-text)]">Recent activity</h2>
          </header>
          <div className="divide-y" style={{ borderColor: "var(--bt-border)" }}>
            {activity.length === 0 ? (
              <p className="px-4 py-6 text-sm text-[var(--bt-muted)]">Nothing yet.</p>
            ) : (
              [...activityByDay.entries()].map(([day, entries]) => (
                <div key={day} className="px-4 py-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-[var(--bt-muted)]">{day}</div>
                  <div className="mt-1.5 flex flex-col gap-2">
                    {entries.map((entry) => (
                      <Link key={entry.id} href={entry.href} className="text-sm text-[var(--bt-text)] hover:underline">
                        {entry.actorLabel ? <span className="font-medium">{entry.actorLabel}: </span> : null}
                        {entry.description}
                      </Link>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <div className="flex flex-col gap-4">
          <section className="rounded-lg border bg-[var(--bt-panel-bg)] p-4 text-center" style={{ borderColor: "var(--bt-border)" }}>
            <div className="text-3xl font-semibold text-[var(--bt-text)]">{clientUpdateCount}</div>
            <p className="text-xs text-[var(--bt-muted)]">Updates shared with clients this month</p>
            <div className="mt-3 flex justify-center gap-2">
              <Link
                href={`/jobs/${job.id}/client-updates`}
                className="rounded border px-3 py-1.5 text-xs font-semibold text-[var(--bt-text)] hover:bg-black/5"
                style={{ borderColor: "var(--bt-border)" }}
              >
                Client Updates
              </Link>
              <Link
                href={`/jobs/${job.id}/daily-logs`}
                className="rounded border px-3 py-1.5 text-xs font-semibold text-[var(--bt-text)] hover:bg-black/5"
                style={{ borderColor: "var(--bt-border)" }}
              >
                Daily Logs
              </Link>
            </div>
          </section>

          <section className="rounded-lg border bg-[var(--bt-panel-bg)]" style={{ borderColor: "var(--bt-border)" }}>
            <header className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: "var(--bt-border)" }}>
              <h2 className="text-sm font-semibold text-[var(--bt-text)]">This week&apos;s agenda</h2>
              <Link href={`/jobs/${job.id}/schedule`} className="text-xs font-medium text-[var(--bt-primary)] hover:underline">
                View schedule
              </Link>
            </header>
            <div className="divide-y" style={{ borderColor: "var(--bt-border)" }}>
              {agendaDays.length === 0 ? (
                <p className="px-4 py-6 text-sm text-[var(--bt-muted)]">No schedule yet.</p>
              ) : (
                agendaDays.map((day) => (
                  <div key={day.label} className="px-4 py-2.5">
                    <div className="text-xs font-semibold text-[var(--bt-text)]">{day.label}</div>
                    {day.items.length > 0 ? (
                      <ul className="mt-0.5 flex flex-col gap-0.5">
                        {day.items.map((item, index) => (
                          <li key={index}>
                            <Link href={item.href} className="text-xs text-[var(--bt-primary)] hover:underline">
                              {item.title}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-xs text-[var(--bt-muted)]">{day.isWorkday ? "Nothing scheduled" : "Non-workday"}</p>
                    )}
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
