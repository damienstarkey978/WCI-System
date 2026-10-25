/** /api/v1/proposal-templates/[templateId] — read, replace or delete one proposal template. */

import { apiError, withApiAuth } from "@/lib/api-auth";
import { formatZodIssues } from "@/lib/api-schemas";
import { proposalTemplateContentSchema } from "@/lib/proposal-templates/content";
import {
  deleteProposalTemplate,
  getProposalTemplate,
  ProposalTemplateNotFoundError,
  updateProposalTemplate,
} from "@/lib/proposal-templates/service";

type Context = { params: Promise<{ templateId: string }> };

export const GET = withApiAuth<Context>(["proposals:read"], async (_request, auth, context) => {
  const { templateId } = await context.params;
  try {
    return Response.json({ data: await getProposalTemplate(auth.organizationId, templateId) });
  } catch (error) {
    if (error instanceof ProposalTemplateNotFoundError) return apiError(404, "not_found", error.message);
    throw error;
  }
});

export const PUT = withApiAuth<Context>(["proposals:write"], async (request, auth, context) => {
  const { templateId } = await context.params;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError(400, "invalid_json", "Request body must be valid JSON.");
  }

  const parsed = proposalTemplateContentSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError(422, "validation_failed", "The proposal template could not be saved.", formatZodIssues(parsed.error));
  }

  try {
    return Response.json({ data: await updateProposalTemplate(auth.organizationId, templateId, parsed.data) });
  } catch (error) {
    if (error instanceof ProposalTemplateNotFoundError) return apiError(404, "not_found", error.message);
    throw error;
  }
});

export const DELETE = withApiAuth<Context>(["proposals:write"], async (_request, auth, context) => {
  const { templateId } = await context.params;
  try {
    await deleteProposalTemplate(auth.organizationId, templateId);
    return new Response(null, { status: 204 });
  } catch (error) {
    if (error instanceof ProposalTemplateNotFoundError) return apiError(404, "not_found", error.message);
    throw error;
  }
});
