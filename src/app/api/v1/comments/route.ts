/** /api/v1/comments — the unified Comment/Activity layer (CLAUDE.md 2.3). */

import { actorFromApiKey } from "@/lib/actor";
import { apiError, withApiAuth } from "@/lib/api-auth";
import { createCommentSchema, formatZodIssues, listCommentsQuerySchema } from "@/lib/api-schemas";
import { createComment, listComments } from "@/lib/comments/service";

export const GET = withApiAuth(["comments:read"], async (request, auth) => {
  const url = new URL(request.url);
  const parsed = listCommentsQuerySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return apiError(
      400,
      "invalid_query",
      "featureType and featureId are required query parameters.",
      formatZodIssues(parsed.error),
    );
  }

  const comments = await listComments({ organizationId: auth.organizationId, ...parsed.data });
  return Response.json({ data: comments });
});

export const POST = withApiAuth(["comments:write"], async (request, auth) => {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError(400, "invalid_json", "Request body must be valid JSON.");
  }

  const parsed = createCommentSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError(422, "validation_failed", "The comment could not be created.", formatZodIssues(parsed.error));
  }

  try {
    const comment = await createComment({
      organizationId: auth.organizationId,
      ...parsed.data,
      actor: actorFromApiKey(auth.apiKeyId),
    });
    return Response.json({ data: comment }, { status: 201 });
  } catch (error) {
    console.error("POST /api/v1/comments failed:", error);
    return apiError(
      500,
      "comment_create_failed",
      error instanceof Error ? error.message : "The comment could not be created.",
    );
  }
});
