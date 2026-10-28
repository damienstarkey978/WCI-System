/**
 * GET /api/v1/files/{fileId} — file metadata plus a freshly signed downloadUrl when
 * File.url is a storage key (not an http(s) URL). See src/lib/files/service.ts.
 */

import { apiError, withApiAuth } from "@/lib/api-auth";
import { db } from "@/lib/db";
import { resolveFileUrlSafe } from "@/lib/files/service";

type Context = { params: Promise<{ fileId: string }> };

export const GET = withApiAuth<Context>(["files:read"], async (_request, auth, context) => {
  const { fileId } = await context.params;
  const file = await db.file.findFirst({
    where: { id: fileId, organizationId: auth.organizationId, deletedAt: null },
  });
  if (!file) return apiError(404, "not_found", `File ${fileId} not found.`);

  const isHttpUrl = /^https?:\/\//i.test(file.url);
  const downloadUrl = isHttpUrl ? file.url : await resolveFileUrlSafe(file.url);

  return Response.json({
    data: {
      ...file,
      /** Raw stored value — may be an http(s) URL or a private storage path. */
      url: file.url,
      /**
       * Fetchable URL for the bytes. Null when the object cannot be signed
       * (missing from bucket / storage not configured).
       */
      downloadUrl,
      storageKey: isHttpUrl ? null : file.url,
    },
  });
});
