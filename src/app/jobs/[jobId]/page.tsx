import Link from "next/link";
import { notFound } from "next/navigation";

import { DocumentIcon, ThumbsUpIcon } from "@/components/shell/icons";
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

function Avatar({ label, size = "md" }: { label: string; size?: "sm" | "md" }) {
  const dim = size === "sm" ? "h-7 w-7 text-[10px]" : "h-9 w-9 text-xs";
  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-full font-semibold ${dim}`}
      style={{ background: "var(--bt-status-open-bg)", color: "var(--bt-status-open-text)" }}
      title={label}
    >
      {initials(label)}
    </div>
  );
}

/** BT empty-state column: outlined thumbs-up + short reassurance copy. */
function UpToDateEmpty({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center gap-2 px-2 py-4 text-center">
      <ThumbsUpIcon className="h-10 w-10 text-[var(--bt-muted)] opacity-70" />
      <p className="text-sm text-[var(--bt-muted)]">{message}</p>
    </div>
  );
}

interface ActivityEntry {
  readonly id: string;
  readonly description: string;
  readonly actorLabel: string | null;
  readonly createdAt: Date;
  readonly href: string;
  readonly itemLabel: string | null;
}

interface AgendaItem {
  readonly title: string;
  readonly href: string;
  readonly kind: "schedule" | "invoice";
}

/**
 * "Job Info" (per Damien's screenshot, 2026-08-29) — the landing page for a selected
 * job, reached from the sidebar or the Jobs > Job Info menu item. Every number here
 * is a real query against this job's own data; nothing is a static mockup value.
 * Layout/copy/empty states mirror Buildertrend's job dashboard (parity-shot-2).
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
  const endOfWeek = new Date(startOfToday.getTime() + 7 * MS_PER_DAY);

  const [
    clockedInCount,
    overdueInvoices,
    dueTodayInvoices,
    dueTodayTodos,
    overdueTodos,
    weekInvoices,
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
      where: { jobId: job.id, status: { in: ["SENT", "PARTIALLY_PAID"] }, dueOn: { lt: startOfToday } },
      select: { id: true, invoiceNumber: true },
    }),
    db.invoice.findMany({
      where: {
        jobId: job.id,
        status: { in: ["SENT", "PARTIALLY_PAID", "DRAFT"] },
        dueOn: { gte: startOfToday, lt: endOfToday },
      },
      select: { id: true, invoiceNumber: true },
    }),
    db.todo.findMany({
      where: { jobId: job.id, status: { in: ["OPEN", "IN_PROGRESS"] }, dueDate: { gte: startOfToday, lt: endOfToday } },
      orderBy: { dueDate: "asc" },
    }),
    db.todo.findMany({
      where: { jobId: job.id, status: { in: ["OPEN", "IN_PROGRESS"] }, dueDate: { lt: startOfToday } },
      select: { id: true },
    }),
    db.invoice.findMany({
      where: {
        jobId: job.id,
        status: { not: "VOID" },
        OR: [{ dueOn: { gte: startOfToday, lt: endOfWeek } }, { issuedOn: { gte: startOfToday, lt: endOfWeek } }],
      },
      select: { id: true, invoiceNumber: true, title: true, dueOn: true, issuedOn: true },
    }),
    db.timeClockEntry.count({ where: { jobId: job.id, approvalStatus: "PENDING" } }),
    db.changeOrder.count({ where: { jobId: job.id, status: "PENDING_APPROVAL" } }),
    db.clientUpdateSummary.count({ where: { jobId: job.id, createdAt: { gte: startOfMonth } } }),
    db.invoice.findMany({
      where: { jobId: job.id },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, invoiceNumber: true, title: true, amountCents: true, createdAt: true },
    }),
    db.dailyLog.findMany({ where: { jobId: job.id }, orderBy: { createdAt: "desc" }, take: 5, include: { authorUser: true } }),
    db.changeOrder.findMany({ where: { jobId: job.id }, orderBy: { createdAt: "desc" }, take: 5 }),
    db.schedule.findFirst({ where: { jobId: job.id, organizationId: user.organizationId }, orderBy: { createdAt: "asc" } }),
  ]);

  const projectManagers = job.accessGrants.map((grant) => grant.user).filter((grantUser) => grantUser.role === UserRole.PM);

  const pastDueCount = overdueInvoices.length + overdueTodos.length;
  const dueTodayCount = dueTodayInvoices.length + dueTodayTodos.length;
  const actionItemsCount = unapprovedShifts + pendingChangeOrders;

  const activity: ActivityEntry[] = [
    ...recentInvoices.map((invoice) => ({
      id: `invoice-${invoice.id}`,
      description: "updated an Invoice",
      actorLabel: user.name ?? user.email,
      createdAt: invoice.createdAt,
      href: `/jobs/${job.id}/invoices/${invoice.id}`,
      itemLabel: invoice.title || invoice.invoiceNumber || `Invoice ${formatMoney(invoice.amountCents)}`,
    })),
    ...recentDailyLogs.map((log) => ({
      id: `dailylog-${log.id}`,
      description: "added a Daily Log",
      actorLabel: log.authorUser.name ?? log.authorUser.email,
      createdAt: log.createdAt,
      href: `/jobs/${job.id}/daily-logs`,
      itemLabel: log.note.slice(0, 60) + (log.note.length > 60 ? "…" : ""),
    })),
    ...recentChangeOrders.map((co) => ({
      id: `co-${co.id}`,
      description: "created a Change Order",
      actorLabel: null,
      createdAt: co.createdAt,
      href: `/jobs/${job.id}/change-orders`,
      itemLabel: co.title,
    })),
  ]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 8);

  const activityByDay = new Map<string, ActivityEntry[]>();
  for (const entry of activity) {
    const key =
      entry.createdAt >= startOfToday
        ? "Today"
        : entry.createdAt >= new Date(startOfToday.getTime() - MS_PER_DAY)
          ? "Yesterday"
          : formatDate(entry.createdAt);
    const bucket = activityByDay.get(key) ?? [];
    bucket.push(entry);
    activityByDay.set(key, bucket);
  }

  let scheduleItemsByDay: Map<number, AgendaItem[]> = new Map();
  if (scheduleRow) {
    const computed = await getComputedSchedule(user.organizationId, scheduleRow.id, { includePhases: false });
    scheduleItemsByDay = new Map();
    for (let offset = 0; offset < 7; offset++) {
      const day = new Date(startOfToday.getTime() + offset * MS_PER_DAY);
      const dayEnd = new Date(day.getTime() + MS_PER_DAY);
      const items = computed.items
        .filter((item) => item.startDate < dayEnd && item.endDate >= day)
        .map((item) => ({ title: item.title, href: `/jobs/${job.id}/schedule`, kind: "schedule" as const }));
      scheduleItemsByDay.set(offset, items);
    }
  }

  const agendaDays = Array.from({ length: 7 }, (_, offset) => {
    const day = new Date(startOfToday.getTime() + offset * MS_PER_DAY);
    const dayEnd = new Date(day.getTime() + MS_PER_DAY);
    const scheduleItems = scheduleItemsByDay.get(offset) ?? [];
    const invoiceItems: AgendaItem[] = weekInvoices
      .filter((invoice) => {
        const when = invoice.dueOn ?? invoice.issuedOn;
        return when != null && when >= day && when < dayEnd;
      })
      .map((invoice) => ({
        title: invoice.title || invoice.invoiceNumber || "Invoice",
        href: `/jobs/${job.id}/invoices/${invoice.id}`,
        kind: "invoice" as const,
      }));
    const items = [...invoiceItems, ...scheduleItems];
    const isWorkday = day.getDay() !== 0 && day.getDay() !== 6;
    return {
      offset,
      dayNum: day.getDate(),
      weekday: DAY_NAME[day.getDay()]!,
      monthShort: day.toLocaleDateString("en-US", { month: "short" }),
      items,
      isWorkday,
      isToday: offset === 0,
    };
  });

  const address = [job.addressLine1, job.city, job.state, job.postalCode].filter(Boolean).join(", ");

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-3 p-3 sm:gap-4 sm:p-6">
      {/* Job summary header — BT: title + Open badge + ⋯, address, clocked-in, Clients / PMs */}
      <div className="rounded-lg border bg-[var(--bt-panel-bg)] p-4 sm:p-5" style={{ borderColor: "var(--bt-border)" }}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h1 className="text-lg font-semibold text-[var(--bt-text)] sm:text-xl">{job.name}</h1>
            <span
              className="rounded-full px-2 py-0.5 text-xs font-semibold"
              style={{ background: "var(--bt-status-open-bg)", color: "var(--bt-status-open-text)" }}
            >
              {STATUS_LABEL[job.status] ?? job.status}
            </span>
          </div>
          {user.role === UserRole.ADMIN || user.role === UserRole.PM ? (
            <Link
              href={`/jobs/${job.id}/settings`}
              className="shrink-0 rounded px-2 py-1 text-lg leading-none text-[var(--bt-muted)] hover:bg-black/5"
              aria-label="Job options"
              title="Job settings"
            >
              ⋯
            </Link>
          ) : null}
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
          {clockedInCount} internal user{clockedInCount === 1 ? "" : "s"} {clockedInCount === 1 ? "is" : "are"} clocked in as of{" "}
          {now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}.
        </p>
        <Link href={`/jobs/${job.id}/time-clock`} className="text-sm text-[var(--bt-primary)] hover:underline">
          View time sheets
        </Link>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--bt-muted)]">Clients</h2>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
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
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
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

      {/* Past Due / Due Today / Action Items — one BT-style card with three columns */}
      <section className="rounded-lg border bg-[var(--bt-panel-bg)]" style={{ borderColor: "var(--bt-border)" }}>
        <div className="grid divide-y sm:grid-cols-3 sm:divide-x sm:divide-y-0" style={{ borderColor: "var(--bt-border)" }}>
          <div className="p-4">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--bt-muted)]">Past Due</h2>
            {pastDueCount === 0 ? (
              <UpToDateEmpty message="Everything is up-to-date." />
            ) : (
              <div className="mt-2 flex flex-col gap-1.5 text-sm">
                {overdueInvoices.length > 0 ? (
                  <Link href={`/jobs/${job.id}/invoices`} className="flex items-center gap-2 font-medium text-[var(--bt-primary)] hover:underline">
                    Invoices
                    <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-400 px-1.5 text-[11px] font-bold text-amber-950">
                      {overdueInvoices.length}
                    </span>
                  </Link>
                ) : null}
                {overdueTodos.length > 0 ? (
                  <Link href={`/jobs/${job.id}/tasks`} className="flex items-center gap-2 text-[var(--bt-primary)] hover:underline">
                    Tasks
                    <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-400 px-1.5 text-[11px] font-bold text-amber-950">
                      {overdueTodos.length}
                    </span>
                  </Link>
                ) : null}
              </div>
            )}
          </div>

          <div className="p-4">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--bt-muted)]">Due Today For You</h2>
            {dueTodayCount === 0 ? (
              <UpToDateEmpty message="You have nothing due today." />
            ) : (
              <div className="mt-2 flex flex-col gap-1.5 text-sm">
                {dueTodayInvoices.length > 0 ? (
                  <Link href={`/jobs/${job.id}/invoices`} className="flex items-center gap-2 font-medium text-[var(--bt-primary)] hover:underline">
                    Invoices
                    <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-400 px-1.5 text-[11px] font-bold text-amber-950">
                      {dueTodayInvoices.length}
                    </span>
                  </Link>
                ) : null}
                {dueTodayTodos.map((todo) => (
                  <Link key={todo.id} href={`/jobs/${job.id}/tasks`} className="text-[var(--bt-primary)] hover:underline">
                    {todo.title}
                  </Link>
                ))}
              </div>
            )}
          </div>

          <div className="p-4">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--bt-muted)]">Action Items</h2>
            {actionItemsCount === 0 ? (
              <UpToDateEmpty message="Nothing requires your attention at the moment." />
            ) : (
              <div className="mt-2 flex flex-col gap-1.5 text-sm">
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
              </div>
            )}
          </div>
        </div>
      </section>

      <div className="grid gap-3 sm:gap-4 lg:grid-cols-3">
        {/* Recent Activity */}
        <section className="rounded-lg border bg-[var(--bt-panel-bg)] lg:col-span-2" style={{ borderColor: "var(--bt-border)" }}>
          <header className="flex items-center justify-between gap-2 border-b px-4 py-3" style={{ borderColor: "var(--bt-border)" }}>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--bt-muted)] sm:text-sm sm:normal-case sm:tracking-normal sm:text-[var(--bt-text)]">
              Recent Activity From Your Team
            </h2>
            <button
              type="button"
              className="rounded border px-2.5 py-1 text-xs font-semibold text-[var(--bt-text)] hover:bg-black/5"
              style={{ borderColor: "var(--bt-border)" }}
              disabled
              title="Activity filters coming soon"
            >
              Filter
            </button>
          </header>
          <div className="divide-y" style={{ borderColor: "var(--bt-border)" }}>
            {activity.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-[var(--bt-muted)]">Nothing yet.</p>
            ) : (
              [...activityByDay.entries()].map(([day, entries]) => (
                <div key={day} className="px-4 py-3">
                  <div className="text-xs font-semibold text-[var(--bt-muted)]">{day}</div>
                  <div className="mt-2 flex flex-col gap-3">
                    {entries.map((entry) => (
                      <div key={entry.id} className="flex gap-2.5">
                        <Avatar label={entry.actorLabel ?? "?"} size="sm" />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-[var(--bt-text)]">
                            {entry.actorLabel ? <span className="font-semibold">{entry.actorLabel}</span> : null}{" "}
                            {entry.description}
                            <span className="ml-1.5 text-xs text-[var(--bt-muted)]">
                              {entry.createdAt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                            </span>
                          </p>
                          {entry.itemLabel ? (
                            <Link href={entry.href} className="mt-0.5 inline-block text-sm text-[var(--bt-primary)] hover:underline">
                              {entry.itemLabel}
                            </Link>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <div className="flex flex-col gap-3 sm:gap-4">
          {/* Client Updates */}
          <section className="rounded-lg border bg-[var(--bt-panel-bg)] p-4 text-center" style={{ borderColor: "var(--bt-border)" }}>
            <div className="text-4xl font-semibold tabular-nums text-[var(--bt-text)]">{clientUpdateCount}</div>
            <p className="mt-1 text-sm text-[var(--bt-muted)]">Updates shared with clients this month</p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <Link
                href={`/jobs/${job.id}/client-updates`}
                className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold text-[var(--bt-text)] hover:bg-black/5"
                style={{ borderColor: "var(--bt-border)" }}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--bt-primary)]" aria-hidden />
                Client Updates
              </Link>
              <Link
                href={`/jobs/${job.id}/daily-logs`}
                className="rounded-full border px-3 py-1.5 text-xs font-semibold text-[var(--bt-text)] hover:bg-black/5"
                style={{ borderColor: "var(--bt-border)" }}
              >
                Daily Logs
              </Link>
            </div>
          </section>

          {/* This Week's Agenda */}
          <section className="rounded-lg border bg-[var(--bt-panel-bg)]" style={{ borderColor: "var(--bt-border)" }}>
            <header className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: "var(--bt-border)" }}>
              <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--bt-muted)]">This Week&apos;s Agenda</h2>
              <Link href={`/jobs/${job.id}/schedule`} className="text-xs font-medium text-[var(--bt-primary)] hover:underline">
                View schedule
              </Link>
            </header>
            <div className="divide-y" style={{ borderColor: "var(--bt-border)" }}>
              {agendaDays.map((day) => (
                <div key={day.offset} className="flex gap-3 px-4 py-2.5">
                  <div className="flex w-10 shrink-0 flex-col items-center pt-0.5">
                    <span
                      className={`flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold ${
                        day.isToday ? "text-white" : "text-[var(--bt-text)]"
                      }`}
                      style={day.isToday ? { background: "var(--bt-primary)" } : undefined}
                    >
                      {day.dayNum}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold text-[var(--bt-text)]">
                      {day.weekday}, {day.monthShort} {day.dayNum}
                    </div>
                    {day.items.length > 0 ? (
                      <ul className="mt-1 flex flex-col gap-1">
                        {day.items.map((item, index) => (
                          <li key={`${item.href}-${index}`}>
                            <Link href={item.href} className="flex items-center gap-1.5 text-xs text-[var(--bt-primary)] hover:underline">
                              <DocumentIcon className="h-3.5 w-3.5 shrink-0 text-[var(--bt-muted)]" />
                              <span className="truncate">{item.title}</span>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-0.5 text-xs text-[var(--bt-muted)]">{day.isWorkday ? "Nothing scheduled" : "Non-workday"}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
