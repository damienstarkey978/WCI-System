/**
 * /api/v1/me — identity + scopes for the authenticated API key.
 * Requires a valid key only (empty required-scope list): every consumer can
 * introspect itself so bots can verify which scopes they were issued.
 */

import { withApiAuth } from "@/lib/api-auth";

export const GET = withApiAuth([], async (_request, auth) => {
  return Response.json({
    data: {
      apiKeyId: auth.apiKeyId,
      name: auth.name,
      agentKind: auth.agentKind,
      organizationId: auth.organizationId,
      scopes: [...auth.scopes].sort(),
    },
  });
});
