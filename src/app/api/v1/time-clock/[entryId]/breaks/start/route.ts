import { apiError, withApiAuth } from "@/lib/api-auth";
import {
  EntryAlreadyClockedOutError,
  EntryNotFoundError,
  OpenBreakExistsError,
  startBreak,
} from "@/lib/time-clock/service";

type Context = { params: Promise<{ entryId: string }> };

export const POST = withApiAuth<Context>(["time-clock:write"], async (_request, auth, context) => {
  const { entryId } = await context.params;

  try {
    const timeClockBreak = await startBreak(auth.organizationId, entryId);
    return Response.json({ data: timeClockBreak }, { status: 201 });
  } catch (error) {
    if (error instanceof EntryNotFoundError) {
      return apiError(404, "not_found", error.message);
    }
    if (error instanceof EntryAlreadyClockedOutError) {
      return apiError(409, "already_clocked_out", error.message);
    }
    if (error instanceof OpenBreakExistsError) {
      return apiError(409, "open_break_exists", error.message);
    }
    throw error;
  }
});
