/**
 * Environment access. Nothing else in the app reads process.env directly.
 */

function optional(name: string): string | undefined {
  const value = process.env[name];
  return value === undefined || value === "" ? undefined : value;
}

export function required(name: string): string {
  const value = optional(name);
  if (value === undefined) {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return value;
}

export const isProduction = process.env.NODE_ENV === "production";
export const isTest = process.env.NODE_ENV === "test";

export function databaseUrl(): string {
  return required("DATABASE_URL");
}

/**
 * Clerk is optional in local development and CI so the app builds and tests run without
 * secrets. When it is not configured, human auth falls back to the dev stub in
 * src/lib/auth.ts — which refuses to run in production.
 */
export function isClerkConfigured(): boolean {
  return (
    optional("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY") !== undefined &&
    optional("CLERK_SECRET_KEY") !== undefined
  );
}

/**
 * Org slug used by the dev auth stub and the seed script. Keeps local data pointed at
 * one predictable organization.
 */
export function devOrganizationSlug(): string {
  return optional("DEV_ORGANIZATION_SLUG") ?? "world-construction";
}

export function devUserEmail(): string {
  return optional("DEV_USER_EMAIL") ?? "dev@worldconstructioninc.com";
}

/**
 * The AI estimate assistant is optional, same pattern as Clerk: without a key, the
 * feature returns a clear "not configured" error rather than the app failing to build
 * or start. WCI OS needs its own key — this is never the coding session's own
 * credentials.
 */
export function isAnthropicConfigured(): boolean {
  return optional("ANTHROPIC_API_KEY") !== undefined;
}

/**
 * Auto-populated Daily Log weather (src/lib/daily-logs/weather.ts) is optional —
 * without it, DailyLog.weather stays null rather than the app failing.
 */
export function isWeatherConfigured(): boolean {
  return optional("WEATHER_API_KEY") !== undefined;
}

export function weatherApiKey(): string | undefined {
  return optional("WEATHER_API_KEY");
}

/**
 * No email/SMS/push provider is wired up yet. Notification rows for those channels
 * are still persisted (src/lib/notifications/service.ts) so nothing is silently
 * dropped; this flag is the seam a real provider integration will check.
 */
export function isEmailConfigured(): boolean {
  return optional("EMAIL_PROVIDER_API_KEY") !== undefined;
}

/**
 * Stripe (client portal payments, Phase 3) is optional, same pattern as every
 * other integration here: without it, payment endpoints return a clear
 * "not configured" error rather than fabricating a payment.
 */
export function isStripeConfigured(): boolean {
  return optional("STRIPE_SECRET_KEY") !== undefined;
}

export function stripeSecretKey(): string | undefined {
  return optional("STRIPE_SECRET_KEY");
}

export function stripeWebhookSecret(): string | undefined {
  return optional("STRIPE_WEBHOOK_SECRET");
}

/**
 * Shared secret for the scheduled-task endpoint (/api/v1/webhooks/process) —
 * there is no per-org API key to check since a scheduler call isn't scoped to
 * one organization. Matches Vercel Cron's own convention of sending
 * `Authorization: Bearer $CRON_SECRET`; any other scheduler works the same way
 * as long as it sends that header.
 */
export function isCronConfigured(): boolean {
  return optional("CRON_SECRET") !== undefined;
}

export function cronSecret(): string | undefined {
  return optional("CRON_SECRET");
}

/**
 * Supabase Storage (job files — photos/documents/videos) is optional, same pattern
 * as every other integration here: without it, upload endpoints return a clear
 * "not configured" error rather than the app failing to build. The service-role key
 * is server-only — never read from a client component or exposed to the bundle.
 */
export function isSupabaseStorageConfigured(): boolean {
  return optional("SUPABASE_URL") !== undefined && optional("SUPABASE_SERVICE_ROLE_KEY") !== undefined;
}

export function supabaseUrl(): string {
  return required("SUPABASE_URL");
}

export function supabaseServiceRoleKey(): string {
  return required("SUPABASE_SERVICE_ROLE_KEY");
}
