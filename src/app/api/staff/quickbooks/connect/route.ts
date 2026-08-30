/**
 * GET /api/staff/quickbooks/connect — admin clicks "Connect to QuickBooks" on
 * /settings/quickbooks; this redirects their browser to Intuit's consent screen.
 * Admin-only: this ties the org's books to an Intuit company, same privilege bar as
 * Company Settings itself.
 */

import { UserRole } from "@/generated/prisma/enums";
import { AuthConfigurationError, requireRole } from "@/lib/auth";
import { isQuickBooksConfigured } from "@/lib/env";
import { buildConnectUrl } from "@/lib/quickbooks/connection-service";

export async function GET() {
  let user;
  try {
    user = await requireRole(UserRole.ADMIN);
  } catch (error) {
    if (error instanceof AuthConfigurationError) {
      return Response.json({ error: { code: "unauthorized", message: error.message } }, { status: 401 });
    }
    throw error;
  }
  if (!isQuickBooksConfigured()) {
    return Response.json({ error: { code: "not_configured", message: "QuickBooks is not configured on this server." } }, { status: 503 });
  }

  return Response.redirect(buildConnectUrl(user.organizationId));
}
