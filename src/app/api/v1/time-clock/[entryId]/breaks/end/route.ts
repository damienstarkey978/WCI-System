import { apiError, withApiAuth } from "@/lib/api-auth";
import { EntryNotFoundError, NoOpenBreakError, endBreak } from "@/lib/time-clock/service";

type Context = { params: Promise<{ entryId: string }> };

export const POST = withApiAuth<Context>(["time-clock:write"], async (_request, auth, context) => {
  const { entryId } = await context.params;

  try {
    const timeClockBreak = await endBreak(auth.organizationId, entryId);
    return Response.json({ data: timeClockBreak });
  } catch (error) {
    if (error instanceof EntryNotFoundError) {
      return apiError(404, "not_found", error.message);
    }
    if (error instanceof NoOpenBreakError) {
      return apiError(409, "no_open_break", error.message);
    }
    throw error;
  }
});
