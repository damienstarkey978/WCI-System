/**
 * POST /api/staff/daily-logs — create a daily log from a signed-in staff session.
 *
 * Lives outside /api/v1 (machine/API-key) and outside Server Actions so create+attach
 * survives a mid-tab deploy: fetch to a stable route does not depend on a build-time
 * Server Action hash the way useActionState does.
 */

import { AuthConfigurationError, requireAppUser } from "@/lib/auth";
import {
  createDailyLog,
  DailyLogAuthorRequiredError,
  JobNotFoundError,
  serializeDailyLog,
} from "@/lib/daily-logs/service";

export async function POST(request: Request) {
  let user;
  try {
    user = await requireAppUser();
  } catch (error) {
    if (error instanceof AuthConfigurationError) {
      return Response.json({ error: { code: "unauthorized", message: error.message } }, { status: 401 });
    }
    throw error;
  }

  let body: {
    jobId?: unknown;
    note?: unknown;
    title?: unknown;
    clientVisible?: unknown;
    subVisible?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ error: { code: "invalid_json", message: "Expected a JSON body." } }, { status: 400 });
  }

  const jobId = typeof body.jobId === "string" ? body.jobId.trim() : "";
  const note = typeof body.note === "string" ? body.note.trim() : "";
  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!jobId) {
    return Response.json({ error: { code: "validation_error", message: "jobId is required." } }, { status: 400 });
  }
  if (!note) {
    return Response.json({ error: { code: "validation_error", message: "Note is required." } }, { status: 400 });
  }

  try {
    const log = await createDailyLog({
      organizationId: user.organizationId,
      jobId,
      authorUserId: user.id,
      title,
      note,
      clientVisible: body.clientVisible !== false,
      subVisible: body.subVisible !== false,
    });
    return Response.json({ data: serializeDailyLog(log) }, { status: 201 });
  } catch (error) {
    if (error instanceof JobNotFoundError) {
      return Response.json({ error: { code: "not_found", message: error.message } }, { status: 404 });
    }
    if (error instanceof DailyLogAuthorRequiredError) {
      return Response.json({ error: { code: "validation_error", message: error.message } }, { status: 400 });
    }
    throw error;
  }
}
