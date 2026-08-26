/** /api/v1/todos — the generic entity that also covers punch lists (CLAUDE.md 2.3). */

import { apiError, withApiAuth } from "@/lib/api-auth";
import { createTodoSchema, formatZodIssues } from "@/lib/api-schemas";
import { db } from "@/lib/db";
import { createTodo, JobNotFoundError } from "@/lib/todos/service";

export const GET = withApiAuth(["todos:read"], async (request, auth) => {
  const params = new URL(request.url).searchParams;
  const jobId = params.get("jobId");
  const status = params.get("status");
  const category = params.get("category");

  const todos = await db.todo.findMany({
    where: {
      organizationId: auth.organizationId,
      ...(jobId ? { jobId } : {}),
      ...(status ? { status: status as never } : {}),
      ...(category ? { category } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { checklistItems: { orderBy: { sortOrder: "asc" } } },
  });

  return Response.json({ data: todos });
});

export const POST = withApiAuth(["todos:write"], async (request, auth) => {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError(400, "invalid_json", "Request body must be valid JSON.");
  }

  const parsed = createTodoSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError(422, "validation_failed", "The todo could not be created.", formatZodIssues(parsed.error));
  }

  try {
    const todo = await createTodo({ organizationId: auth.organizationId, ...parsed.data });
    return Response.json({ data: todo }, { status: 201 });
  } catch (error) {
    if (error instanceof JobNotFoundError) {
      return apiError(422, "unknown_job", error.message);
    }
    throw error;
  }
});
