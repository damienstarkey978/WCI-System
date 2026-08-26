import { apiError, withApiAuth } from "@/lib/api-auth";
import { formatZodIssues, setChecklistItemDoneSchema } from "@/lib/api-schemas";
import { ChecklistItemNotFoundError, setChecklistItemDone } from "@/lib/todos/service";

type Context = { params: Promise<{ checklistItemId: string }> };

export const POST = withApiAuth<Context>(["todos:write"], async (request, auth, context) => {
  const { checklistItemId } = await context.params;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError(400, "invalid_json", "Request body must be valid JSON.");
  }

  const parsed = setChecklistItemDoneSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError(422, "validation_failed", "isDone (boolean) is required.", formatZodIssues(parsed.error));
  }

  try {
    const item = await setChecklistItemDone(auth.organizationId, checklistItemId, parsed.data.isDone);
    return Response.json({ data: item });
  } catch (error) {
    if (error instanceof ChecklistItemNotFoundError) {
      return apiError(404, "not_found", error.message);
    }
    throw error;
  }
});
