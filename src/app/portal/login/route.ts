/**
 * GET /portal/login?token=... — the browser landing page for a portal invite
 * (or re-login) link. Exchanges the token for a ClientSession the same way
 * POST /api/v1/portal/login does, but for a browser: the session token is set
 * as an httpOnly cookie here rather than handed back as JSON for a caller to
 * store itself.
 */

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { InvalidActionTokenError, loginWithToken } from "@/lib/client-portal/auth";
import { isProduction } from "@/lib/env";

import { PORTAL_SESSION_COOKIE } from "@/lib/client-portal/browser-session";

const SESSION_COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token");
  if (!token) redirect("/portal?error=missing_token");

  try {
    const { sessionToken } = await loginWithToken(token);
    const store = await cookies();
    store.set(PORTAL_SESSION_COOKIE, sessionToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      path: "/portal",
      maxAge: SESSION_COOKIE_MAX_AGE_SECONDS,
    });
  } catch (error) {
    if (error instanceof InvalidActionTokenError) redirect("/portal?error=invalid_token");
    throw error;
  }

  redirect("/portal/jobs");
}
