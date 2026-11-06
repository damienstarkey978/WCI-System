/**
 * POST /api/staff/daily-logs/[logId]/files — attach photo/video/document files to an
 * existing daily log from a signed-in staff session (multipart FormData, field `files`).
 *
 * Split from create so a deploy mid-upload cannot orphan the whole Server Action, and
 * so the client can retry attaches independently after the log row already exists.
 */

import { AuthConfigurationError, requireAppUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { uploadAndRegisterFile } from "@/lib/files/service";
import { StorageNotConfiguredError } from "@/lib/storage/supabase-storage";

export async function POST(request: Request, context: { params: Promise<{ logId: string }> }) {
  let user;
  try {
    user = await requireAppUser();
  } catch (error) {
    if (error instanceof AuthConfigurationError) {
      return Response.json({ error: { code: "unauthorized", message: error.message } }, { status: 401 });
    }
    throw error;
  }

  const { logId } = await context.params;
  const log = await db.dailyLog.findFirst({
    where: { id: logId, organizationId: user.organizationId },
    select: { id: true, jobId: true, clientVisible: true, subVisible: true },
  });
  if (!log) {
    return Response.json({ error: { code: "not_found", message: "Daily log not found." } }, { status: 404 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: { code: "invalid_body", message: "Expected multipart form data." } }, { status: 400 });
  }

  const files = form.getAll("files").filter((entry): entry is File => entry instanceof File && entry.size > 0);
  if (files.length === 0) {
    return Response.json({ error: { code: "validation_error", message: "Add at least one file." } }, { status: 400 });
  }

  const created: { id: string; fileName: string; category: string }[] = [];
  try {
    for (const file of files) {
      const category = file.type.startsWith("image/") ? "PHOTO" : file.type.startsWith("video/") ? "VIDEO" : "DOCUMENT";
      const registered = await uploadAndRegisterFile({
        organizationId: user.organizationId,
        jobId: log.jobId,
        uploadedByUserId: user.id,
        fileName: file.name,
        bytes: new Uint8Array(await file.arrayBuffer()),
        mimeType: file.type || null,
        sizeBytes: file.size,
        category,
        clientVisible: log.clientVisible,
        subVisible: log.subVisible,
        dailyLogId: log.id,
      });
      created.push({ id: registered.id, fileName: registered.fileName, category: registered.category });
    }
  } catch (error) {
    if (error instanceof StorageNotConfiguredError) {
      return Response.json({ error: { code: "storage_not_configured", message: error.message } }, { status: 503 });
    }
    throw error;
  }

  return Response.json({ data: { files: created } }, { status: 201 });
}
