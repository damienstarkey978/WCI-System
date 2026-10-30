import Link from "next/link";

import { AppShell } from "@/components/shell/AppShell";
import { notificationBellDataForUser, sidebarJobsForOrg } from "@/components/shell/data";
import { SetupNotice } from "@/app/admin/setup-notice";
import { UserRole } from "@/generated/prisma/enums";
import { currentAppUserOrRedirect } from "@/lib/auth";
import { db } from "@/lib/db";
import { salesRepJobWhere } from "@/lib/staff/sales-rep-scope";

import { JobsGrid } from "./jobs-grid";

// Reads live data on every request — never prerendered at build time.
export const dynamic = "force-dynamic";

const STATUS_TABS = [
  { key: "all", label: "All Jobs" },
  { key: "OPEN", label: "In Progress" },
  { key: "PRE_SALE", label: "Pre-Construction" },
  { key: "WARRANTY", label: "Warranty" },
  { key: "CLOSED", label: "Closed" },
] as const;

export default async function JobsIndexPage({ searchParams }: PageProps<"/jobs">) {
  const { status: statusParam, group: groupParam, q: queryParam } = await searchParams;
  const status = STATUS_TABS.some((t) => t.key === statusParam) ? (statusParam as (typeof STATUS_TABS)[number]["key"]) : "all";
  const group = typeof groupParam === "string" ? groupParam : "";
  const query = typeof queryParam === "string" ? queryParam.trim().toLowerCase() : "";

  let user;
  try {
    user = await currentAppUserOrRedirect();
  } catch (error) {
    return <SetupNotice detail={error instanceof Error ? error.message : String(error)} />;
  }

  // The index lists every non-template job, pre-sale included (the sidebar hides
  // PRE_SALE on purpose; see sidebarJobsForOrg). FIELD users only see granted jobs.
  const [jobs, sidebarJobs, bell] = await Promise.all([
    db.job.findMany({
      where: {
        organizationId: user.organizationId,
        isTemplate: false,
        ...(user.role === UserRole.FIELD ? { accessGrants: { some: { userId: user.id } } } : {}),
        ...salesRepJobWhere(user),
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        prefix: true,
        status: true,
        contractType: true,
        projectedStart: true,
        projectedEnd: true,
        addressLine1: true,
        city: true,
        state: true,
        qboCustomerId: true,
        jobGroup: { select: { name: true } },
        clientAccess: { take: 1, select: { client: { select: { name: true } } } },
      },
    }),
    sidebarJobsForOrg(user.organizationId, user),
    notificationBellDataForUser(user.organizationId, user.id),
  ]);

  const counts = new Map<string, number>();
  for (const job of jobs) counts.set(job.status, (counts.get(job.status) ?? 0) + 1);
  const groupNames = [...new Set(jobs.map((job) => job.jobGroup?.name ?? "General"))].sort((a, b) => a.localeCompare(b));

  const visible = jobs.filter((job) => {
    if (status !== "all" && job.status !== status) return false;
    if (group && (job.jobGroup?.name ?? "General") !== group) return false;
    if (query && !`${job.prefix ?? ""} ${job.name} ${job.addressLine1 ?? ""} ${job.city ?? ""}`.toLowerCase().includes(query)) return false;
    return true;
  });

  const href = (next: { status?: string; group?: string }) => {
    const params = new URLSearchParams();
    const nextStatus = next.status ?? status;
    const nextGroup = next.group ?? group;
    if (nextStatus !== "all") params.set("status", nextStatus);
    if (nextGroup) params.set("group", nextGroup);
    if (query) params.set("q", query);
    const qs = params.toString();
    return `/jobs${qs ? `?${qs}` : ""}`;
  };

  const rows = visible.map((job) => ({
    id: job.id,
    name: job.name,
    prefix: job.prefix,
    status: job.status,
    groupName: job.jobGroup?.name ?? "General",
    customerName: job.clientAccess[0]?.client.name ?? null,
    address: [job.addressLine1, job.city, job.state].filter(Boolean).join(", ") || null,
    contractType: job.contractType,
    projectedStart: job.projectedStart ? job.projectedStart.toISOString() : null,
    projectedEnd: job.projectedEnd ? job.projectedEnd.toISOString() : null,
    qboLinked: job.qboCustomerId !== null,
  }));

  return (
    <AppShell jobs={sidebarJobs} notifications={bell.notifications} unreadCount={bell.unreadCount}>
      <div className="mx-auto flex max-w-6xl flex-col gap-4 p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-[var(--bt-text)]">Jobs</h1>
            <p className="mt-0.5 text-xs text-[var(--bt-muted)]">
              Tabs count every non-template job. Dashboard “Active” is open + warranty only; the
              sidebar defaults to open (excludes pre-sale).
            </p>
          </div>
          <Link
            href="/jobs/new"
            className="shrink-0 rounded px-4 py-2 text-sm font-semibold text-[var(--bt-on-primary)]"
            style={{ background: "var(--bt-primary)" }}
          >
            + Job
          </Link>
        </div>

        <nav className="flex flex-wrap items-end justify-between gap-3 border-b" style={{ borderColor: "var(--bt-border)" }}>
          <div className="flex gap-1">
            {STATUS_TABS.map((t) => {
              const count = t.key === "all" ? jobs.length : (counts.get(t.key) ?? 0);
              return (
                <Link
                  key={t.key}
                  href={href({ status: t.key })}
                  className="-mb-px border-b-2 px-3 py-2 text-sm font-medium transition"
                  style={{ borderColor: t.key === status ? "var(--bt-primary)" : "transparent", color: t.key === status ? "var(--bt-primary)" : "var(--bt-muted)" }}
                >
                  {t.label} ({count})
                </Link>
              );
            })}
          </div>
          <form action="/jobs" className="flex items-center gap-2 pb-2">
            {status !== "all" ? <input type="hidden" name="status" value={status} /> : null}
            <select name="group" defaultValue={group} aria-label="Job group" className="rounded border px-2 py-1.5 text-sm" style={{ borderColor: "var(--bt-border)" }}>
              <option value="">All job groups</option>
              {groupNames.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
            <input name="q" defaultValue={query} placeholder="Search jobs" aria-label="Search jobs" className="rounded border px-2 py-1.5 text-sm" style={{ borderColor: "var(--bt-border)" }} />
            <button type="submit" className="rounded border px-3 py-1.5 text-sm font-medium" style={{ borderColor: "var(--bt-border)" }}>
              Apply
            </button>
          </form>
        </nav>

        <JobsGrid rows={rows} />
      </div>
    </AppShell>
  );
}
