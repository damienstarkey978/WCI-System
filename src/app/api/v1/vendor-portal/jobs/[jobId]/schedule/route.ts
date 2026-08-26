/**
 * GET /api/v1/vendor-portal/jobs/[jobId]/schedule — sub-visible schedule
 * items, computed (CPM). VendorJobAccess.scheduleScope is ASSIGNED_ONLY by
 * default but not yet enforced here — see CLAUDE.md 7: ScheduleItem
 * assignment is by User id, and a Vendor is not a User, so there is no
 * assignee match to filter on yet. Every sub-visible item is returned
 * regardless of scheduleScope until that gap is closed.
 */

import { authenticatePortalJobRequest, portalAuthErrorResponse } from "@/lib/vendor-portal/auth";
import { db } from "@/lib/db";
import { getComputedSchedule } from "@/lib/scheduling/service";

type Context = { params: Promise<{ jobId: string }> };

export async function GET(request: Request, context: Context) {
  const { jobId } = await context.params;

  try {
    const vendor = await authenticatePortalJobRequest(request, jobId, null);

    const schedule = await db.schedule.findFirst({ where: { organizationId: vendor.organizationId, jobId } });
    if (!schedule) return Response.json({ data: null });

    const computed = await getComputedSchedule(vendor.organizationId, schedule.id);

    return Response.json({
      data: { ...computed, items: computed.items.filter((item) => item.subVisible) },
    });
  } catch (error) {
    const response = portalAuthErrorResponse(error);
    if (response) return response;
    throw error;
  }
}
