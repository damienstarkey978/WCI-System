/**
 * GET/PATCH /api/v1/organization/estimating-settings — org markup/tax/terms/template (CR P3 #29).
 */

import { apiError, withApiAuth } from "@/lib/api-auth";
import { formatZodIssues, updateEstimatingSettingsSchema } from "@/lib/api-schemas";
import {
  DefaultProposalTemplateNotFoundError,
  getEstimatingSettings,
  OrganizationNotFoundError,
  updateEstimatingSettings,
} from "@/lib/organization/estimating-settings";

export const GET = withApiAuth(["estimates:read"], async (_request, auth) => {
  try {
    const settings = await getEstimatingSettings(auth.organizationId);
    return Response.json({ data: settings });
  } catch (error) {
    if (error instanceof OrganizationNotFoundError) return apiError(404, "not_found", error.message);
    throw error;
  }
});

export const PATCH = withApiAuth(["estimates:write"], async (request, auth) => {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError(400, "invalid_json", "Request body must be valid JSON.");
  }
  const parsed = updateEstimatingSettingsSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError(422, "validation_failed", "Estimating settings could not be updated.", formatZodIssues(parsed.error));
  }

  try {
    const settings = await updateEstimatingSettings(auth.organizationId, parsed.data);
    return Response.json({ data: settings });
  } catch (error) {
    if (error instanceof OrganizationNotFoundError) return apiError(404, "not_found", error.message);
    if (error instanceof DefaultProposalTemplateNotFoundError) {
      return apiError(422, "unknown_template", error.message);
    }
    throw error;
  }
});
