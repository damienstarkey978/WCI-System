/**
 * POST /api/v1/permit-inspections/{inspectionId}/share-link
 * Issue (or rotate) a durable inspector share link for an Inspection Pictures folder.
 * Same headless token namespace as the staff UI (wciips_). No email/SMS send —
 * bots/staff copy the URL and deliver out-of-band.
 */

import { apiError, withApiAuth } from "@/lib/api-auth";
import { formatZodIssues, issueInspectionShareLinkSchema } from "@/lib/api-schemas";
import { appBaseUrl } from "@/lib/app-url";
import {
  issueInspectionPictureShareLink,
} from "@/lib/permitting/inspection-pictures";
import { InspectionNotFoundError } from "@/lib/permitting/service";

type Context = { params: Promise<{ inspectionId: string }> };

export const POST = withApiAuth<Context>(["files:write"], async (request, auth, context) => {
  const { inspectionId } = await context.params;

  let payload: unknown = {};
  try {
    const text = await request.text();
    if (text.trim()) payload = JSON.parse(text);
  } catch {
    return apiError(400, "invalid_json", "Request body must be valid JSON.");
  }

  const parsed = issueInspectionShareLinkSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError(422, "validation_failed", "Could not issue share link.", formatZodIssues(parsed.error));
  }

  try {
    const issued = await issueInspectionPictureShareLink({
      organizationId: auth.organizationId,
      inspectionId,
      label: parsed.data.label,
      revokePrevious: parsed.data.revokePrevious,
    });
    const base = (await appBaseUrl()).replace(/\/+$/, "");
    return Response.json(
      {
        data: {
          linkId: issued.linkId,
          token: issued.token,
          sharePath: issued.sharePath,
          shareUrl: `${base}${issued.sharePath}`,
          expiresAt: issued.expiresAt,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof InspectionNotFoundError) {
      return apiError(404, "not_found", error.message);
    }
    throw error;
  }
});
