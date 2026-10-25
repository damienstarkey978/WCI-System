import Link from "next/link";
import { notFound } from "next/navigation";

import { SetupNotice } from "@/app/admin/setup-notice";
import { PageHeader } from "@/components/shell/PageHeader";
import { currentAppUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { workedHours } from "@/lib/time-clock/hours";

import { ShiftsGrid } from "./shifts-grid";

export const dynamic = "force-dynamic";

const TABS = [
  { key: "all", label: "Shifts" },
  { key: "pending", label: "Needs approval" },
] as const;

export default async function TimeClockPage({ params, searchParams }: PageProps<"/jobs/[jobId]/time-clock">) {
  const { jobId } = await params;
  const { tab: tabParam } = await searchParams;
  const tab = tabParam === "pending" ? "pending" : "all";

  let user;
  try {
    user = await currentAppUser();
  } catch (error) {
    return <SetupNotice detail={error instanceof Error ? error.message : String(error)} />;
  }
  if (!user) {
    return <SetupNotice detail="No organization found. Seed the database, then reload." />;
  }

  const job = await db.job.findFirst({ where: { id: jobId, organizationId: user.organizationId } });
  if (!job) notFound();

  const entries = await db.timeClockEntry.findMany({
    where: { jobId: job.id, ...(tab === "pending" ? { approvalStatus: "PENDING" as const, clockOutAt: { not: null } } : {}) },
    orderBy: { clockInAt: "desc" },
    take: 100,
    include: { user: true, costCode: true, breaks: true },
  });

  const canReview = user.role === "ADMIN" || user.role === "PM";

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 p-6">
      <PageHeader
        jobName={job.name}
        title="Time Clock"
        action={
          <Link
            href="/field/time-clock"
            className="rounded px-4 py-2 text-sm font-semibold text-[var(--bt-on-primary)]"
            style={{ background: "var(--bt-primary)" }}
          >
            Clock in
          </Link>
        }
      />

      <nav className="flex gap-1 border-b" style={{ borderColor: "var(--bt-border)" }}>
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/jobs/${job.id}/time-clock${t.key === "all" ? "" : `?tab=${t.key}`}`}
            className="-mb-px border-b-2 px-3 py-2 text-sm font-medium transition"
            style={{ borderColor: t.key === tab ? "var(--bt-primary)" : "transparent", color: t.key === tab ? "var(--bt-primary)" : "var(--bt-muted)" }}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      <ShiftsGrid
        canReview={canReview}
        rows={entries.map((entry) => ({
          id: entry.id,
          jobId: job.id,
          worker: entry.user.email,
          costCode: entry.costCode.name,
          clockInAt: entry.clockInAt.toISOString(),
          inProgress: entry.clockOutAt === null,
          // workedHours() throws for a shift that has not clocked out yet.
          hours: entry.clockOutAt ? workedHours(entry.clockInAt, entry.clockOutAt, entry.breaks) : 0,
          approvalStatus: entry.approvalStatus,
        }))}
      />
    </div>
  );
}
