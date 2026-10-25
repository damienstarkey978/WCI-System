/**
 * GET /vendor-portal/login?token=... — the browser landing page for a sub's portal
 * invite (or re-login) link. Exchanges the single-use token for a VendorSession the
 * same way POST /api/v1/vendor-portal/login does, but sets the session as an httpOnly
 * cookie for the browser instead of returning it as JSON.
 */

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { isProduction } from "@/lib/env";
import { InvalidActionTokenError, loginWithToken } from "@/lib/vendor-portal/auth";
import { VENDOR_PORTAL_SESSION_COOKIE } from "@/lib/vendor-portal/browser-session";

const SESSION_COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token");
  if (!token) redirect("/vendor-portal?error=missing_token");

  try {
    const { sessionToken } = await loginWithToken(token);
    const store = await cookies();
    store.set(VENDOR_PORTAL_SESSION_COOKIE, sessionToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      path: "/vendor-portal",
      maxAge: SESSION_COOKIE_MAX_AGE_SECONDS,
    });
  } catch (error) {
    if (error instanceof InvalidActionTokenError) redirect("/vendor-portal?error=invalid_token");
    throw error;
  }

  redirect("/vendor-portal/jobs");
}
