import { apiError, withApiAuth } from "@/lib/api-auth";
import { closeRfi, RfiNotFoundError } from "@/lib/rfis/service";

type Context = { params: Promise<{ rfiId: string }> };

export const POST = withApiAuth<Context>(["rfis:write"], async (_request, auth, context) => {
  const { rfiId } = await context.params;

  try {
    const rfi = await closeRfi(auth.organizationId, rfiId);
    return Response.json({ data: rfi });
  } catch (error) {
    if (error instanceof RfiNotFoundError) {
      return apiError(404, "not_found", error.message);
    }
    throw error;
  }
});
