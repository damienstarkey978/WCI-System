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
 * SendGrid Inbound Parse, for bills forwarded to bills-{orgSlug}@inbox.<domain>.
 *
 * Inbound Parse does **not** sign its requests, so a shared secret in the webhook
 * URL's query string is the protection: SendGrid is configured to POST to
 * /api/webhooks/sendgrid/inbound?key=<this>, and anything without it is refused.
 * IP allowlisting is not used — SendGrid publishes no stable inbound range.
 *
 * Only needed in this direction. Sending mail would need SENDGRID_API_KEY; receiving
 * does not, so that key is deliberately not read here.
 */
export function isInboundEmailConfigured(): boolean {
  return optional("SENDGRID_INBOUND_SECRET") !== undefined;
}

export function inboundEmailSecret(): string | undefined {
  return optional("SENDGRID_INBOUND_SECRET");
}

/**
 * The domain the per-org forwarding addresses live on. Only the MX record and the
 * SendGrid Inbound Parse host need to agree with this; it is separate from the app's
 * own domain so mail routing can move without touching the app's.
 */
export function inboundEmailDomain(): string {
  return optional("INBOUND_EMAIL_DOMAIN") ?? "inbox.worldconstructionjax.com";
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

/**
 * QuickBooks Online (CLAUDE.md 2.3's two-way sync). One Intuit app serves every
 * organization's connection — QBO_CLIENT_ID/SECRET identify *that app* to Intuit,
 * not any one company file; which company an org is synced to lives in the
 * QuickBooksConnection row created when that org completes OAuth (src/lib/quickbooks).
 */
export function isQuickBooksConfigured(): boolean {
  return optional("QBO_CLIENT_ID") !== undefined && optional("QBO_CLIENT_SECRET") !== undefined;
}

export function quickBooksClientId(): string {
  return required("QBO_CLIENT_ID");
}

export function quickBooksClientSecret(): string {
  return required("QBO_CLIENT_SECRET");
}

export function quickBooksRedirectUri(): string {
  return required("QBO_REDIRECT_URI");
}

export function quickBooksEnvironment(): "sandbox" | "production" {
  return optional("QBO_ENVIRONMENT") === "production" ? "production" : "sandbox";
}

/**
 * 32-byte key (base64) for encrypting stored QuickBooks tokens at rest — see
 * src/lib/quickbooks/crypto.ts. Generate one with `openssl rand -base64 32`.
 */
export function quickBooksTokenEncryptionKey(): string {
  return required("QBO_TOKEN_ENCRYPTION_KEY");
}

/** Verifier token from the Intuit app's Webhooks settings page, for validating inbound webhook signatures. */
export function quickBooksWebhookVerifierToken(): string | undefined {
  return optional("QBO_WEBHOOK_VERIFIER_TOKEN");
}

/**
 * Transactional email (vendor portal invites). Resend's HTTP API
 * (https://resend.com): EMAIL_PROVIDER_API_KEY is the API key, EMAIL_FROM the verified
 * sender, e.g. `World Construction Inc <office@worldconstructioninc.com>`. Needs both —
 * and a verified sending domain on the Resend side. Without them, invites fall back to
 * showing the one-time login link for a person to send by hand (the client portal's
 * existing behavior).
 */
export function isTransactionalEmailConfigured(): boolean {
  return optional("EMAIL_PROVIDER_API_KEY") !== undefined && optional("EMAIL_FROM") !== undefined;
}

export function transactionalEmailSettings(): { apiKey: string; from: string } | null {
  const apiKey = optional("EMAIL_PROVIDER_API_KEY");
  const from = optional("EMAIL_FROM");
  return apiKey && from ? { apiKey, from } : null;
}

/**
 * Transactional SMS (proposal Text-to-client). Twilio Messages API:
 * TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN + TWILIO_FROM_NUMBER (E.164).
 * Without all three, Text actions return a clear not-configured error.
 */
export function isTransactionalSmsConfigured(): boolean {
  return (
    optional("TWILIO_ACCOUNT_SID") !== undefined &&
    optional("TWILIO_AUTH_TOKEN") !== undefined &&
    optional("TWILIO_FROM_NUMBER") !== undefined
  );
}

export function transactionalSmsSettings(): {
  accountSid: string;
  authToken: string;
  fromNumber: string;
} | null {
  const accountSid = optional("TWILIO_ACCOUNT_SID");
  const authToken = optional("TWILIO_AUTH_TOKEN");
  const fromNumber = optional("TWILIO_FROM_NUMBER");
  return accountSid && authToken && fromNumber ? { accountSid, authToken, fromNumber } : null;
}

/** Public origin of this deployment (no trailing slash), for links that leave the app — e.g. https://app.worldconstructionjax.com. */
export function appBaseUrlFromEnv(): string | undefined {
  return optional("APP_BASE_URL")?.replace(/\/+$/, "");
}
