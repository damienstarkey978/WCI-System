import { apiError, withApiAuth } from "@/lib/api-auth";
import { formatZodIssues, updateTodoStatusSchema } from "@/lib/api-schemas";
import { TodoNotFoundError, updateTodoStatus } from "@/lib/todos/service";

type Context = { params: Promise<{ todoId: string }> };

export const POST = withApiAuth<Context>(["todos:write"], async (request, auth, context) => {
  const { todoId } = await context.params;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError(400, "invalid_json", "Request body must be valid JSON.");
  }

  const parsed = updateTodoStatusSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError(422, "validation_failed", "Invalid status.", formatZodIssues(parsed.error));
  }

  try {
    const todo = await updateTodoStatus(auth.organizationId, todoId, parsed.data.status);
    return Response.json({ data: todo });
  } catch (error) {
    if (error instanceof TodoNotFoundError) {
      return apiError(404, "not_found", error.message);
    }
    throw error;
  }
});
