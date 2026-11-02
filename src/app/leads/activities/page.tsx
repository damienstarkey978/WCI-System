import { SetupNotice } from "@/app/admin/setup-notice";
import { currentAppUser } from "@/lib/auth";
import {
  activityContactDate,
  activityDisplayStatus,
  activityTypeDisplayLabel,
  parseLeadActivityNote,
} from "@/lib/crm/lead-activity-display";
import { db } from "@/lib/db";
import { salesRepLeadActivityWhere } from "@/lib/staff/sales-rep-scope";

import type { ActivityRow } from "./activities-grid";
import { LeadActivitiesClient } from "./lead-activities-client";

export const dynamic = "force-dynamic";

/**
 * Cross-lead activity list, Buildertrend's "Lead Activities" Activity view.
 * Sales shell hides the jobs sidebar (see leads/layout.tsx).
 */
export default async function LeadActivitiesPage({ searchParams }: PageProps<"/leads/activities">) {
  const params = await searchParams;
  const view = typeof params.view === "string" ? params.view : "activity";
  const activeTab = view === "list" ? "list" : "activity";

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
      ...salesRepLeadActivityWhere(user),
    },
    // Newest first so Past Due / open follow-ups aren't truncated out of an
    // oldest-N window; the grid still defaults Contact Date sort to ascending.
    orderBy: { occurredAt: "desc" },
    take: 2000,
    include: {
      lead: {
        select: {
          id: true,
          name: true,
          title: true,
          phone: true,
          email: true,
          city: true,
          stage: true,
          assignedUser: { select: { name: true, email: true } },
        },
      },
      createdByUser: { select: { name: true, email: true } },
      createdByApiKey: { select: { name: true } },
    },
  });

  const typeSet = new Set<string>();
  const assigneeSet = new Set<string>();
  const leadStagesByLeadId: Record<string, string> = {};

  const rows: ActivityRow[] = activities.map((activity) => {
    const parsed = parseLeadActivityNote(activity.note);
    const typeLabel = activityTypeDisplayLabel(activity.type, parsed.btType);
    const status = activityDisplayStatus({
      btStatus: parsed.btStatus,
      completedAt: activity.completedAt,
      dueDate: activity.dueDate,
      type: activity.type,
    });
    const assignedUser =
      parsed.assigned ||
      activity.lead.assignedUser?.name ||
      activity.lead.assignedUser?.email ||
      activity.createdByUser?.name ||
      activity.createdByUser?.email ||
      activity.createdByApiKey?.name ||
      null;
    const contactDate = activityContactDate({
      dueDate: activity.dueDate,
      occurredAt: activity.occurredAt,
    }).toISOString();

    typeSet.add(typeLabel);
    if (assignedUser) assigneeSet.add(assignedUser);
    leadStagesByLeadId[activity.lead.id] = activity.lead.stage;

    return {
      id: activity.id,
      leadId: activity.lead.id,
      title: activity.lead.title?.trim() || activity.lead.name,
      type: activity.type,
      typeLabel,
      status,
      assignedUser,
      attendees: null,
      contactDate,
      activityNotes: parsed.body,
      cellPhone: activity.lead.phone,
      city: activity.lead.city,
      email: activity.lead.email,
      completed: activity.completedAt !== null,
    };
  });

  return (
    <LeadActivitiesClient
      rows={rows}
      leadStagesByLeadId={leadStagesByLeadId}
      activityTypeOptions={[...typeSet].sort((a, b) => a.localeCompare(b))}
      assignedUserOptions={[...assigneeSet].sort((a, b) => a.localeCompare(b))}
      activeTab={activeTab}
    />
  );
}
