/**
 * GET /api/v1/folders?jobId= — list FileFolders for a job.
 *   kind=all (default) — Documents + inspection picture folders (raw FileFolder rows).
 *   kind=inspection — Inspection Pictures view (folders for JobPermitInspection rows
 *     already on the job; does NOT invent typical inspections on empty shells).
 *   kind=document — FileFolders that are not linked as inspection picture folders.
 *
 * POST /api/v1/folders — create a Documents folder or an Inspection Pictures folder.
 *   Inspection kind creates/links JobPermitInspection + FileFolder without requiring
 *   a Permitting UI detour (ops must not be gated behind "open permitting").
 *
 * DELETE /api/v1/folders/{folderId} — see ./[folderId]/route.ts.
 */

import { apiError, withApiAuth } from "@/lib/api-auth";
import {
  createFolderSchema,
  formatZodIssues,
  listFoldersQuerySchema,
} from "@/lib/api-schemas";
import { db } from "@/lib/db";
import {
  createFolder,
  FolderJobNotFoundError,
  FolderNameTakenError,
  listFolders,
} from "@/lib/files/folders";
import {
  createInspectionPictureFolder,
  InspectionFolderNameRequiredError,
  listInspectionPictureFolders,
} from "@/lib/permitting/inspection-pictures";
import { JobNotFoundError } from "@/lib/permitting/service";

export const GET = withApiAuth(["files:read"], async (request, auth) => {
  const parsed = listFoldersQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) {
    return apiError(400, "invalid_query", "jobId is required.", formatZodIssues(parsed.error));
  }

  const job = await db.job.findFirst({
    where: { id: parsed.data.jobId, organizationId: auth.organizationId },
    select: { id: true },
  });
  if (!job) return apiError(404, "not_found", `Job ${parsed.data.jobId} not found.`);

  if (parsed.data.kind === "inspection") {
    try {
      const folders = await listInspectionPictureFolders(auth.organizationId, job.id);
      return Response.json({ data: folders, kind: "inspection" });
    } catch (error) {
      if (error instanceof JobNotFoundError) {
        return apiError(404, "not_found", error.message);
      }
      throw error;
    }
  }

  const folders = await listFolders(auth.organizationId, job.id);

  if (parsed.data.kind === "document") {
    const inspectionFolderIds = new Set(
      (
        await db.jobPermitInspection.findMany({
          where: { permit: { jobId: job.id, organizationId: auth.organizationId }, folderId: { not: null } },
          select: { folderId: true },
        })
      )
        .map((row) => row.folderId)
        .filter((id): id is string => Boolean(id)),
    );
    return Response.json({
      data: folders.filter((folder) => !inspectionFolderIds.has(folder.id)),
      kind: "document",
    });
  }

  return Response.json({ data: folders, kind: "all" });
});

export const POST = withApiAuth(["files:write"], async (request, auth) => {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError(400, "invalid_json", "Request body must be valid JSON.");
  }

  const parsed = createFolderSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError(422, "validation_failed", "The folder could not be created.", formatZodIssues(parsed.error));
  }

  try {
    if (parsed.data.kind === "inspection") {
      const folder = await createInspectionPictureFolder({
        organizationId: auth.organizationId,
        jobId: parsed.data.jobId,
        name: parsed.data.name,
        trade: parsed.data.trade,
      });
      return Response.json({ data: folder, kind: "inspection" }, { status: 201 });
    }

    const folder = await createFolder(auth.organizationId, parsed.data.jobId, parsed.data.name);
    return Response.json(
      {
        data: {
          id: folder.id,
          name: folder.name,
          clientVisible: folder.clientVisible,
          subVisible: folder.subVisible,
          createdAt: folder.createdAt,
          updatedAt: folder.updatedAt,
        },
        kind: "document",
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof FolderJobNotFoundError || error instanceof JobNotFoundError) {
      return apiError(404, "not_found", error.message);
    }
    if (error instanceof FolderNameTakenError) {
      return apiError(409, "conflict", error.message);
    }
    if (error instanceof InspectionFolderNameRequiredError) {
      return apiError(422, "validation_failed", error.message);
    }
    throw error;
  }
});
