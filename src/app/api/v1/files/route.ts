/**
 * /api/v1/files — file metadata registration. See src/lib/files/service.ts for
 * why there's no upload endpoint yet (no S3/R2 credentials configured).
 */

import { apiError, withApiAuth } from "@/lib/api-auth";
import { formatZodIssues, registerFileSchema } from "@/lib/api-schemas";
import { db } from "@/lib/db";
import { DailyLogNotFoundError, JobNotFoundError, registerFile } from "@/lib/files/service";

export const GET = withApiAuth(["files:read"], async (request, auth) => {
  const params = new URL(request.url).searchParams;
  const jobId = params.get("jobId");
  const category = params.get("category");

  const files = await db.file.findMany({
    where: {
      organizationId: auth.organizationId,
      ...(jobId ? { jobId } : {}),
      ...(category ? { category: category as never } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return Response.json({ data: files });
});

export const POST = withApiAuth(["files:write"], async (request, auth) => {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError(400, "invalid_json", "Request body must be valid JSON.");
  }

  const parsed = registerFileSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError(422, "validation_failed", "The file could not be registered.", formatZodIssues(parsed.error));
  }

  try {
    const file = await registerFile({ organizationId: auth.organizationId, ...parsed.data });
    return Response.json({ data: file }, { status: 201 });
  } catch (error) {
    if (error instanceof JobNotFoundError || error instanceof DailyLogNotFoundError) {
      return apiError(422, "not_found", error.message);
    }
    throw error;
  }
});
