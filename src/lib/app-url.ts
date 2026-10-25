/**
 * The public origin of this deployment, for links that leave the app (portal invites).
 * APP_BASE_URL wins when set — the reliable choice, since a Server Action behind a
 * CDN/proxy can otherwise see an internal host. Falls back to the incoming request's
 * forwarded host, then localhost for local dev.
 */

import { headers } from "next/headers";

import { appBaseUrlFromEnv } from "@/lib/env";

export async function appBaseUrl(): Promise<string> {
  const fromEnv = appBaseUrlFromEnv();
  if (fromEnv) return fromEnv;

  const incoming = await headers();
  const host = incoming.get("x-forwarded-host") ?? incoming.get("host");
  if (!host) return "http://localhost:3000";
  const protocol = incoming.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${protocol}://${host}`;
}
