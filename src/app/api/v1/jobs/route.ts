/**
 * /api/v1/jobs — machine-facing job list and creation.
 *
 * Phase 0 surface. Every response is scoped to the API key's organization; an agent
 * cannot read across orgs even with a valid key.
 */

import { Prisma } from "@/generated/prisma/client";
import { JobStatus } from "@/generated/prisma/enums";
import { apiError, withApiAuth } from "@/lib/api-auth";
import { createJobSchema, formatZodIssues, listJobsQuerySchema } from "@/lib/api-schemas";
import { db } from "@/lib/db";
import { emitEvent } from "@/lib/webhooks";

export const GET = withApiAuth(["jobs:read"], async (request, auth) => {
  const url = new URL(request.url);
  const parsed = listJobsQuerySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return apiError(400, "invalid_query", "Invalid query parameters.", formatZodIssues(parsed.error));
  }
  const { status, contractType, jobGroupId, includeTemplates, limit, cursor } = parsed.data;

  const jobs = await db.job.findMany({
    where: {
      organizationId: auth.organizationId,
      ...(status ? { status } : {}),
      ...(contractType ? { contractType } : {}),
      ...(jobGroupId ? { jobGroupId } : {}),
      ...(includeTemplates ? {} : { isTemplate: false }),
    },
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });

  const hasMore = jobs.length > limit;
  const page = hasMore ? jobs.slice(0, limit) : jobs;

  return Response.json({
    data: page,
    pagination: {
      nextCursor: hasMore ? page[page.length - 1].id : null,
      hasMore,
    },
  });
});

export const POST = withApiAuth(["jobs:write"], async (request, auth) => {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError(400, "invalid_json", "Request body must be valid JSON.");
  }

  const parsed = createJobSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError(422, "validation_failed", "The job could not be created.", formatZodIssues(parsed.error));
  }
  const input = parsed.data;

  if (input.jobGroupId) {
    const group = await db.jobGroup.findFirst({
      where: { id: input.jobGroupId, organizationId: auth.organizationId },
      select: { id: true },
    });
    if (!group) {
      return apiError(422, "unknown_job_group", `No job group ${input.jobGroupId} in this organization.`);
    }
  }

  const { customFields, ...rest } = input;

  try {
    const job = await db.job.create({
      data: {
        ...rest,
        organizationId: auth.organizationId,
        // New jobs always start in PRE_SALE and move via the state machine, so that
        // every job has a complete, auditable lifecycle history.
        status: JobStatus.PRE_SALE,
        customFields: (customFields ?? {}) as Prisma.InputJsonValue,
      },
    });

    await db.jobStatusEvent.create({
      data: { jobId: job.id, from: null, to: JobStatus.PRE_SALE, actorApiKeyId: auth.apiKeyId },
    });

    await emitEvent(auth.organizationId, "job.created", { jobId: job.id, prefix: job.prefix, name: job.name });
    return Response.json({ data: job }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return apiError(409, "duplicate_prefix", `A job with prefix "${input.prefix}" already exists.`);
    }
    throw error;
  }
});
