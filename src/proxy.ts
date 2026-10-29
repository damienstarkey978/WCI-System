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

import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import type { NextFetchEvent, NextRequest } from "next/server";

import { matchApiV1Route } from "@/lib/api-v1-route-table";
import { isClerkConfigured } from "@/lib/env";

/**
 * The Buildertrend-match staff shell (src/components/shell) and everything under
 * it. Unauthenticated, these pages' own currentAppUser() null-check would render
 * a "database not seeded" message even to a real visitor who simply isn't signed
 * in yet — so gate them here instead, before any page code runs.
 */
const isProtectedStaffRoute = createRouteMatcher(["/dashboard(.*)", "/jobs(.*)", "/job-groups(.*)", "/leads(.*)", "/reports(.*)", "/admin(.*)"]);

const clerk = isClerkConfigured()
  ? clerkMiddleware(async (auth, request) => {
      if (isProtectedStaffRoute(request)) {
        await auth.protect({ unauthenticatedUrl: new URL("/sign-in", request.url).toString() });
      }
    })
  : null;

/**
 * Routes reachable without an API key or x-api-key header:
 *   - the OpenAPI spec — an integrator has to be able to read the contract before
 *     they have credentials to call anything in it.
 *   - the Stripe webhook receiver — Stripe signs its request with a
 *     Stripe-Signature header, not a bearer token; that signature (verified in
 *     the route itself, src/lib/payments/stripe.ts) *is* this route's auth.
 *   - the QuickBooks webhook receiver — same shape, Intuit signs with an
 *     intuit-signature header instead (src/lib/quickbooks/webhook.ts).
 */
const PUBLIC_API_PATHS: ReadonlySet<string> = new Set([
  "/api/v1/openapi.json",
  "/api/v1/webhooks/stripe",
  "/api/v1/webhooks/quickbooks",
]);

function apiJsonError(
  status: number,
  code: string,
  message: string,
  extraHeaders?: HeadersInit,
  details?: unknown,
): NextResponse {
  return NextResponse.json(
    { error: { code, message, ...(details === undefined ? {} : { details }) } },
    { status, headers: extraHeaders },
  );
}

export default function proxy(request: NextRequest, event: NextFetchEvent) {
  if (request.nextUrl.pathname.startsWith("/api/v1")) {
    const pathname = request.nextUrl.pathname;
    const relative = pathname.slice("/api/v1".length) || "/";
    const match = matchApiV1Route(relative);

    if (match.kind === "not_found") {
      // Unknown /api/v1 paths must not fall through to the website HTML 404.
      return apiJsonError(404, "not_found", `No API route for ${pathname}.`);
    }

    const method = request.method.toUpperCase();
    if (method !== "OPTIONS" && method !== "HEAD" && !match.methods.includes(method)) {
      return apiJsonError(
        405,
        "method_not_allowed",
        `Method not allowed. Allowed: ${match.methods.join(", ")}.`,
        { Allow: match.methods.join(", ") },
        { allowed: match.methods },
      );
    }

    if (PUBLIC_API_PATHS.has(pathname)) {
      return NextResponse.next();
    }

    const hasCredentials =
      request.headers.get("authorization") !== null || request.headers.get("x-api-key") !== null;

    if (!hasCredentials) {
      return apiJsonError(401, "unauthorized", "A valid API key is required.", {
        "WWW-Authenticate": 'Bearer realm="wci-os"',
      });
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
