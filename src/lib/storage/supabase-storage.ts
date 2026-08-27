/**
 * Supabase Storage for job files (photos/documents/videos). Server-only — the
 * service-role key must never reach a client bundle or a browser-automation
 * script; every caller here runs inside a Server Action or Route Handler.
 *
 * File.url stores a storage *path* (e.g. "{orgId}/{jobId}/photo/{id}-name.jpg"),
 * not a public URL — the bucket is private, so every read regenerates a fresh
 * signed URL rather than persisting one (src/lib/files/service.ts's
 * resolveFileUrl does this). This module is only the storage-object plumbing;
 * it never touches the File table itself.
 */

import { createClient } from "@supabase/supabase-js";

import { isSupabaseStorageConfigured, supabaseServiceRoleKey, supabaseUrl } from "@/lib/env";

export const JOB_FILES_BUCKET = "job-files";

export class StorageNotConfiguredError extends Error {
  constructor() {
    super("Supabase Storage is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
    this.name = "StorageNotConfiguredError";
  }
}

let cachedClient: ReturnType<typeof createClient> | null = null;

function client() {
  if (!isSupabaseStorageConfigured()) throw new StorageNotConfiguredError();
  cachedClient ??= createClient(supabaseUrl(), supabaseServiceRoleKey(), {
    auth: { persistSession: false },
  });
  return cachedClient;
}

/** Sanitizes a filename for use as a storage path segment — keeps the extension, strips everything unsafe. */
export function sanitizeFileName(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-180);
}

export function buildStoragePath(input: {
  organizationId: string;
  jobId: string;
  category: string;
  fileId: string;
  fileName: string;
}): string {
  const safeName = sanitizeFileName(input.fileName);
  return `${input.organizationId}/${input.jobId}/${input.category.toLowerCase()}/${input.fileId}-${safeName}`;
}

export async function uploadJobFile(path: string, bytes: Uint8Array | Buffer, contentType: string | null): Promise<void> {
  const { error } = await client()
    .storage.from(JOB_FILES_BUCKET)
    .upload(path, bytes, { contentType: contentType ?? undefined, upsert: false });
  if (error) throw new Error(`Storage upload failed for ${path}: ${error.message}`);
}

const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 hour — never persisted, always regenerated on read.

export async function signedJobFileUrl(path: string, expiresInSeconds = SIGNED_URL_TTL_SECONDS): Promise<string> {
  const { data, error } = await client().storage.from(JOB_FILES_BUCKET).createSignedUrl(path, expiresInSeconds);
  if (error || !data) throw new Error(`Could not sign URL for ${path}: ${error?.message ?? "unknown error"}`);
  return data.signedUrl;
}

export async function deleteJobFile(path: string): Promise<void> {
  const { error } = await client().storage.from(JOB_FILES_BUCKET).remove([path]);
  if (error) throw new Error(`Storage delete failed for ${path}: ${error.message}`);
}
