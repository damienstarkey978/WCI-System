/**
 * Catch-all for unmatched /api/v1/* paths.
 * Belt-and-suspenders with src/proxy.ts — both return JSON 404/405 so API
 * clients never receive the website HTML 404 page.
 */

import { apiError, methodNotAllowed } from "@/lib/api-auth";

function notFound(request: Request): Response {
  const path = new URL(request.url).pathname;
  return apiError(404, "not_found", `No API route for ${path}.`);
}

export function GET(request: Request) {
  return notFound(request);
}
export function POST(request: Request) {
  return notFound(request);
}
export function PUT(request: Request) {
  return notFound(request);
}
export function PATCH(request: Request) {
  return notFound(request);
}
export function DELETE(request: Request) {
  return notFound(request);
}
export function HEAD(request: Request) {
  return notFound(request);
}
export function OPTIONS() {
  return methodNotAllowed([]);
}
