import Link from "next/link";

import { SetupNotice } from "@/app/admin/setup-notice";
import { EmptyState } from "@/components/shell/EmptyState";
import { currentAppUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

const ACTIVITY_TYPE_LABEL: Record<string, string> = {
  CALL: "Call",
  EMAIL: "Email",
  MEETING: "Meeting",
  NOTE: "Note",
  TASK: "Task",
};

/**
 * Cross-lead activity feed — Buildertrend's "Lead Activities" (List view).
 * The per-lead detail page (src/app/leads/[leadId]/page.tsx) has the same
 * data scoped to one lead; this is the org-wide timeline across all of them.
 */
export default async function LeadActivitiesPage() {
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
    where: { organizationId: user.organizationId },
    orderBy: { occurredAt: "desc" },
    take: 200,
    include: { lead: { select: { id: true, name: true } }, createdByUser: true },
  });

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4 p-6">
      <h1 className="text-xl font-semibold text-[var(--bt-text)]">Lead activities</h1>

      {activities.length === 0 ? (
        <EmptyState title="No activity yet" description="Calls, emails, meetings, and follow-up tasks logged against leads will appear here." />
      ) : (
        <div className="overflow-hidden rounded-lg border bg-white" style={{ borderColor: "var(--bt-border)" }}>
          <table className="w-full text-left text-sm">
            <thead>
              <tr
                className="border-b text-xs font-semibold uppercase tracking-wide text-[var(--bt-muted)]"
                style={{ borderColor: "var(--bt-border)" }}
              >
                <th className="px-4 py-3">Lead</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Note</th>
                <th className="px-4 py-3">By</th>
                <th className="px-4 py-3">Date</th>
              </tr>
            </thead>
            <tbody>
              {activities.map((activity) => (
                <tr key={activity.id} className="border-b align-top last:border-0" style={{ borderColor: "var(--bt-border)" }}>
                  <td className="px-4 py-3">
                    <Link href={`/leads/${activity.lead.id}?tab=activities`} className="font-medium text-[var(--bt-primary)] hover:underline">
                      {activity.lead.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-[var(--bt-text)]">{ACTIVITY_TYPE_LABEL[activity.type] ?? activity.type}</td>
                  <td className="px-4 py-3 text-[var(--bt-text)]">
                    <span className="line-clamp-2">{activity.note}</span>
                    {activity.type === "TASK" ? (
                      <span className="ml-1 text-xs text-[var(--bt-muted)]">
                        {activity.completedAt ? "(done)" : activity.dueDate ? `(due ${formatDate(activity.dueDate)})` : null}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-[var(--bt-muted)]">{activity.createdByUser?.email ?? "—"}</td>
                  <td className="px-4 py-3 text-[var(--bt-muted)]">{formatDate(activity.occurredAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
