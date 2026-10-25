/** /api/v1/proposals/[proposalId]/apply-template — copy a proposal template into a DRAFT proposal. */

import { z } from "zod";

import { apiError, withApiAuth } from "@/lib/api-auth";
import { formatZodIssues } from "@/lib/api-schemas";
import { ProposalTemplateNotFoundError } from "@/lib/proposal-templates/service";
import { applyProposalTemplate, ProposalNotEditableError, ProposalNotFoundError } from "@/lib/proposals/service";

type Context = { params: Promise<{ proposalId: string }> };

const applyTemplateSchema = z.object({ templateId: z.string().min(1).max(64) });

export const POST = withApiAuth<Context>(["proposals:write"], async (request, auth, context) => {
  const { proposalId } = await context.params;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError(400, "invalid_json", "Request body must be valid JSON.");
  }

  const parsed = applyTemplateSchema.safeParse(payload);
  if (!parsed.success) {
    return apiError(422, "validation_failed", "Pass the templateId to apply.", formatZodIssues(parsed.error));
  }

  try {
    const result = await applyProposalTemplate(auth.organizationId, proposalId, parsed.data.templateId);
    return Response.json({ data: result });
  } catch (error) {
    if (error instanceof ProposalNotFoundError) return apiError(404, "not_found", error.message);
    if (error instanceof ProposalTemplateNotFoundError) return apiError(422, "unknown_template", error.message);
    if (error instanceof ProposalNotEditableError) return apiError(409, "not_draft", error.message);
    throw error;
  }
});
