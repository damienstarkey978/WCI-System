import Link from "next/link";

import { SetupNotice } from "@/app/admin/setup-notice";
import { ACTIVITY_TYPE_META, ACTIVITY_TYPE_ORDER, ActivityTypeIcon } from "@/components/leads/activity-type";
import { EmptyState } from "@/components/shell/EmptyState";
import { CalendarIcon } from "@/components/shell/icons";
import { currentAppUser } from "@/lib/auth";
import { db } from "@/lib/db";

import { ActivitiesGrid } from "./activities-grid";

export const dynamic = "force-dynamic";

const TABS = [
  { key: "all", label: "All" },
  { key: "open-tasks", label: "Open tasks" },
  ...ACTIVITY_TYPE_ORDER.map((key) => ({ key, label: ACTIVITY_TYPE_META[key].label + "s" })),
] as const;

/**
 * Cross-lead activity list, Buildertrend's "Lead Activities". The per-lead detail
 * page (src/app/leads/[leadId]/page.tsx) has the same data scoped to one lead; this
 * is the org-wide view, with the calendar view one link away. Sales shell hides the
 * jobs sidebar (see leads/layout.tsx).
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
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 p-4 sm:gap-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-[var(--bt-text)]">Lead Activities</h1>
          <p className="mt-0.5 text-sm text-[var(--bt-muted)]">Calls, emails, meetings, notes, and follow-up tasks across all leads.</p>
        </div>
        <Link
          href="/leads/calendar"
          className="inline-flex min-h-10 items-center gap-1.5 rounded border px-3 py-2 text-sm font-medium text-[var(--bt-text)] sm:min-h-0"
          style={{ borderColor: "var(--bt-border)" }}
        >
          <CalendarIcon className="h-4 w-4 text-[var(--bt-muted)]" />
          Calendar view
        </Link>
      </div>

      <nav className="flex gap-1 overflow-x-auto border-b" style={{ borderColor: "var(--bt-border)" }} aria-label="Activity filters">
        {TABS.map((t) => {
          const active = t.key === tab;
          const typeKey = ACTIVITY_TYPE_ORDER.includes(t.key as (typeof ACTIVITY_TYPE_ORDER)[number])
            ? (t.key as (typeof ACTIVITY_TYPE_ORDER)[number])
            : null;
          return (
            <Link
              key={t.key}
              href={`/leads/activities${t.key === "all" ? "" : `?tab=${t.key}`}`}
              className="-mb-px inline-flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium transition"
              style={{ borderColor: active ? "var(--bt-primary)" : "transparent", color: active ? "var(--bt-primary)" : "var(--bt-muted)" }}
            >
              {typeKey ? <ActivityTypeIcon type={typeKey} size="sm" /> : null}
              {t.key === "open-tasks" ? <ActivityTypeIcon type="TASK" size="sm" /> : null}
              {t.label}
            </Link>
          );
        })}
      </nav>

      {activities.length === 0 && tab === "all" ? (
        <EmptyState
          title="No activity yet"
          description="Log a call, email, meeting, note, or follow-up task on a lead — everything shows up here."
        />
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
