import { apiError, withApiAuth } from "@/lib/api-auth";
import { clockOutSchema, formatZodIssues } from "@/lib/api-schemas";
import { EntryAlreadyClockedOutError, EntryNotFoundError, clockOut } from "@/lib/time-clock/service";
import { OpenBreakError } from "@/lib/time-clock/hours";

type Context = { params: Promise<{ entryId: string }> };

export const POST = withApiAuth<Context>(["time-clock:write"], async (request, auth, context) => {
  const { entryId } = await context.params;

  let payload: unknown = {};
  const text = await request.text();
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      return apiError(400, "invalid_json", "Request body must be valid JSON.");
    }
  }

  const parsed = clockOutSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError(422, "validation_failed", "Could not clock out.", formatZodIssues(parsed.error));
  }

  try {
    const entry = await clockOut({
      organizationId: auth.organizationId,
      entryId,
      gps: parsed.data.gps ?? undefined,
    });
    return Response.json({ data: entry });
  } catch (error) {
    if (error instanceof EntryNotFoundError) {
      return apiError(404, "not_found", error.message);
    }
    if (error instanceof EntryAlreadyClockedOutError) {
      return apiError(409, "already_clocked_out", error.message);
    }
    if (error instanceof OpenBreakError) {
      return apiError(409, "open_break", error.message);
    }
    throw error;
  }
});
