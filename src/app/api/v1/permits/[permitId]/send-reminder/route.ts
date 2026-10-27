/**
 * /api/v1/permits/{permitId}/send-reminder — email the assigned vendor (Heather ops).
 */

import { apiError, withApiAuth } from "@/lib/api-auth";
import { EmailNotConfiguredError } from "@/lib/email/send";
import {
  NoVendorEmailError,
  PermitNotFoundError,
  sendPermitReminder,
} from "@/lib/permitting/service";

type Context = { params: Promise<{ permitId: string }> };

export const POST = withApiAuth<Context>(["permits:write"], async (_request, auth, context) => {
  const { permitId } = await context.params;

  try {
    const result = await sendPermitReminder(auth.organizationId, permitId);
    return Response.json({ data: result });
  } catch (error) {
    if (error instanceof PermitNotFoundError) {
      return apiError(404, "not_found", error.message);
    }
    if (error instanceof EmailNotConfiguredError) {
      return apiError(503, "email_not_configured", error.message);
    }
    if (error instanceof NoVendorEmailError) {
      return apiError(422, "no_vendor_email", error.message);
    }
    if (error instanceof Error && error.message === "This permit is already marked pulled.") {
      return apiError(409, "already_pulled", error.message);
    }
    throw error;
  }
});
