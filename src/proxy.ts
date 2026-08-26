/**
 * Next.js 16 proxy (the file formerly known as middleware.ts).
 *
 * Two separate auth worlds meet here and must not mix (CLAUDE.md 2.1):
 *   - /api/v1/*  — machine consumers. Clerk never runs on these routes; a missing
 *                  Authorization header is rejected cheaply here, and the real
 *                  authorization happens per-route via withApiAuth().
 *   - everything else — human staff sessions, handled by Clerk.
 *
 * This is a coarse pre-filter only. Never treat a request reaching a route as
 * authorized because it passed through here — matcher config can skip this file, and
 * Server Actions POST to the route they live on.
 */

import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import type { NextFetchEvent, NextRequest } from "next/server";

import { isClerkConfigured } from "@/lib/env";

const clerk = isClerkConfigured() ? clerkMiddleware() : null;

/**
 * The one /api/v1 route reachable without an API key: an integrator has to be able
 * to read the contract before they have credentials to call anything in it.
 */
const PUBLIC_API_PATHS: ReadonlySet<string> = new Set(["/api/v1/openapi.json"]);

export default function proxy(request: NextRequest, event: NextFetchEvent) {
  if (request.nextUrl.pathname.startsWith("/api/v1")) {
    if (PUBLIC_API_PATHS.has(request.nextUrl.pathname)) {
      return NextResponse.next();
    }

    const hasCredentials =
      request.headers.get("authorization") !== null || request.headers.get("x-api-key") !== null;

    if (!hasCredentials) {
      return NextResponse.json(
        { error: { code: "unauthorized", message: "A valid API key is required." } },
        { status: 401, headers: { "WWW-Authenticate": 'Bearer realm="wci-os"' } },
      );
    }
    return NextResponse.next();
  }

  if (clerk) {
    return clerk(request, event);
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    // Everything except Next internals and static assets.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)",
  ],
};
