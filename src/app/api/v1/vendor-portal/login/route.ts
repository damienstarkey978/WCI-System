/**
 * POST /api/v1/vendor-portal/login — exchange a portal invite (or re-login)
 * token for a VendorSession. Token travels as Authorization: Bearer, same
 * reasoning as the Client Portal equivalent.
 */

import { apiError, extractToken } from "@/lib/api-auth";
import { InvalidActionTokenError, loginWithToken } from "@/lib/vendor-portal/auth";

export async function POST(request: Request) {
  const token = extractToken(request);
  if (!token) return apiError(401, "unauthorized", "A portal login token is required.");

  try {
    const { sessionToken, vendor } = await loginWithToken(token);
    return Response.json({ data: { sessionToken, vendorId: vendor.vendorId } });
  } catch (error) {
    if (error instanceof InvalidActionTokenError) {
      return apiError(401, "invalid_token", error.message);
    }
    throw error;
  }
}
