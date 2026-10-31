/**
 * Official Duval / Jacksonville permit-form blank catalog.
 * Sourced PDFs live under /public/permit-forms/duval-jax/ with sourceUrl + revisionDate.
 * Never invent form wording — unavailable forms stay unavailable.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

export type PermitFormManifestStatus = "available" | "unavailable";

export type PermitFormManifestEntry = {
  readonly key: string;
  readonly title: string;
  readonly file: string | null;
  readonly sourceUrl: string | null;
  readonly revisionDate: string | null;
  readonly status: PermitFormManifestStatus;
};

export type PermitFormManifest = {
  readonly county: string;
  readonly municipality: string;
  readonly revisionNote: string;
  readonly forms: readonly PermitFormManifestEntry[];
};

const MANIFEST_RELATIVE = path.join("public", "permit-forms", "duval-jax", "manifest.json");

let cached: PermitFormManifest | null = null;

export function duvalJaxFormsDir(): string {
  return path.join(process.cwd(), "public", "permit-forms", "duval-jax");
}

export function loadDuvalJaxManifest(): PermitFormManifest {
  if (cached) return cached;
  const raw = readFileSync(path.join(process.cwd(), MANIFEST_RELATIVE), "utf8");
  cached = JSON.parse(raw) as PermitFormManifest;
  return cached;
}

/** Test helper — drop the in-memory cache after rewriting the fixture. */
export function clearDuvalJaxManifestCache(): void {
  cached = null;
}

export function manifestEntryForKey(formKey: string): PermitFormManifestEntry | null {
  return loadDuvalJaxManifest().forms.find((f) => f.key === formKey) ?? null;
}

export function officialBlankPathForKey(formKey: string): string | null {
  const entry = manifestEntryForKey(formKey);
  if (!entry || entry.status !== "available" || !entry.file) return null;
  return path.join(duvalJaxFormsDir(), entry.file);
}

export function isOfficialFormAvailable(formKey: string): boolean {
  const entry = manifestEntryForKey(formKey);
  return Boolean(entry && entry.status === "available" && entry.file);
}
