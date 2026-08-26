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
