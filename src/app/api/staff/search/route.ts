/**
 * GET /api/staff/search?q=... — backs the top-nav search box. Lives outside
 * /api/v1 (machine-facing, API-key-only per src/proxy.ts) since this is for a
 * signed-in human staff session, same pattern as
 * /api/staff/files/batch-import.
 */

import { AuthConfigurationError, requireAppUser } from "@/lib/auth";
import { searchStaffApp } from "@/lib/search/service";

export async function GET(request: Request) {
  let user;
  try {
    user = await requireAppUser();
  } catch (error) {
    if (error instanceof AuthConfigurationError) {
      return Response.json({ error: { code: "unauthorized", message: error.message } }, { status: 401 });
    }
    throw error;
  }

  const query = new URL(request.url).searchParams.get("q") ?? "";
  const results = await searchStaffApp(user.organizationId, user, query);
  return Response.json({ data: results });
}
