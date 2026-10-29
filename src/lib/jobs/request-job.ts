import { cache } from "react";

import { db } from "@/lib/db";

/**
 * Request-cached Job lookup by org. Job layout and almost every nested page each
 * used to `findFirst` the same row independently — share one hit per request.
 */
export const findOrgJob = cache(async function findOrgJob(organizationId: string, jobId: string) {
  return db.job.findFirst({ where: { id: jobId, organizationId } });
});

/** Existence + name only — enough for list pages that don't need the full Job. */
export const findOrgJobSummary = cache(async function findOrgJobSummary(organizationId: string, jobId: string) {
  return db.job.findFirst({
    where: { id: jobId, organizationId },
    select: {
      id: true,
      name: true,
      prefix: true,
      status: true,
      contractType: true,
      organizationId: true,
    },
  });
});
