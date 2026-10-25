import Link from "next/link";

import { SetupNotice } from "@/app/admin/setup-notice";
import { EmptyState } from "@/components/shell/EmptyState";
import { currentAppUser } from "@/lib/auth";
import { db } from "@/lib/db";

import { ActivitiesGrid } from "./activities-grid";

export const dynamic = "force-dynamic";

const TABS = [
  { key: "all", label: "All" },
  { key: "open-tasks", label: "Open tasks" },
  { key: "CALL", label: "Calls" },
  { key: "EMAIL", label: "Emails" },
  { key: "MEETING", label: "Meetings" },
  { key: "NOTE", label: "Notes" },
] as const;

/**
 * Cross-lead activity list, Buildertrend's "Lead Activities". The per-lead detail
 * page (src/app/leads/[leadId]/page.tsx) has the same data scoped to one lead; this
 * is the org-wide view, with the calendar view one link away.
 */
export default async function LeadActivitiesPage({ searchParams }: PageProps<"/leads/activities">) {
  const { tab: tabParam } = await searchParams;
  const tab = TABS.some((t) => t.key === tabParam) ? (tabParam as (typeof TABS)[number]["key"]) : "all";

  let user;
  try {
    user = await currentAppUser();
  } catch (error) {
    return <SetupNotice detail={error instanceof Error ? error.message : String(error)} />;
  }
  if (!user) {
    return <SetupNotice detail="No organization found. Seed the database, then reload." />;
  }

  const activities = await db.leadActivity.findMany({
    where: {
      organizationId: user.organizationId,
      ...(tab === "open-tasks" ? { type: "TASK" as const, completedAt: null } : tab !== "all" ? { type: tab } : {}),
    },
    orderBy: { occurredAt: "desc" },
    take: 500,
    include: { lead: { select: { id: true, name: true } }, createdByUser: true },
  });

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-[var(--bt-text)]">Lead activities</h1>
        <Link href="/leads/calendar" className="rounded border px-3 py-2 text-sm font-medium text-[var(--bt-text)]" style={{ borderColor: "var(--bt-border)" }}>
          Calendar view
        </Link>
      </div>

      <nav className="flex flex-wrap gap-1 border-b" style={{ borderColor: "var(--bt-border)" }}>
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/leads/activities${t.key === "all" ? "" : `?tab=${t.key}`}`}
            className="-mb-px border-b-2 px-3 py-2 text-sm font-medium transition"
            style={{ borderColor: t.key === tab ? "var(--bt-primary)" : "transparent", color: t.key === tab ? "var(--bt-primary)" : "var(--bt-muted)" }}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {activities.length === 0 && tab === "all" ? (
        <EmptyState title="No activity yet" description="Calls, emails, meetings, and follow-up tasks logged against leads will appear here." />
      ) : (
        <ActivitiesGrid
          rows={activities.map((activity) => ({
            id: activity.id,
            leadId: activity.lead.id,
            leadName: activity.lead.name,
            type: activity.type,
            note: activity.note,
            by: activity.createdByUser?.email ?? null,
            occurredAt: activity.occurredAt.toISOString(),
            dueDate: activity.dueDate ? activity.dueDate.toISOString() : null,
            completed: activity.completedAt !== null,
          }))}
        />
      )}
    </div>
  );
}
