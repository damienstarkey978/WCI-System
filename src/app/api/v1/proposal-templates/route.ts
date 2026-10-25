/** /api/v1/proposal-templates — list/create reusable proposal shells (cover message, sections, payment schedule; no pricing). */

import { apiError, withApiAuth } from "@/lib/api-auth";
import { formatZodIssues } from "@/lib/api-schemas";
import { proposalTemplateContentSchema } from "@/lib/proposal-templates/content";
import { createProposalTemplate, listProposalTemplates } from "@/lib/proposal-templates/service";

export const GET = withApiAuth(["proposals:read"], async (_request, auth) => {
  const templates = await listProposalTemplates(auth.organizationId);
  return Response.json({ data: templates });
});

export const POST = withApiAuth(["proposals:write"], async (request, auth) => {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError(400, "invalid_json", "Request body must be valid JSON.");
  }

  const parsed = proposalTemplateContentSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError(422, "validation_failed", "The proposal template could not be created.", formatZodIssues(parsed.error));
  }

  const template = await createProposalTemplate(auth.organizationId, parsed.data);
  return Response.json({ data: template }, { status: 201 });
});
