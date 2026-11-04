/**
 * POST /jobs/{jobId}/files/download-zip — staff bulk download of selected job
 * files as a store-method ZIP (no new zip dependency). Body JSON:
 * `{ "fileIds": ["…"] }`.
 */

import { currentAppUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { buildStoredZip, uniqueZipEntryNames } from "@/lib/files/zip-store";
import { downloadJobFile } from "@/lib/storage/supabase-storage";

export const dynamic = "force-dynamic";

const MAX_FILES = 100;

async function bytesForFileUrl(url: string): Promise<Uint8Array> {
  if (/^https?:\/\//i.test(url)) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status}`);
    return new Uint8Array(await response.arrayBuffer());
  }
  return downloadJobFile(url);
}

export async function POST(request: Request, context: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await context.params;
  const user = await currentAppUser();
  if (!user) return new Response("Not signed in.", { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response("Expected JSON body.", { status: 400 });
  }

  const fileIds = Array.isArray((body as { fileIds?: unknown }).fileIds)
    ? (body as { fileIds: unknown[] }).fileIds.map((id) => String(id)).filter(Boolean)
    : [];
  if (fileIds.length === 0) return new Response("Select at least one file.", { status: 400 });
  if (fileIds.length > MAX_FILES) {
    return new Response(`At most ${MAX_FILES} files per download.`, { status: 400 });
  }

  const job = await db.job.findFirst({
    where: { id: jobId, organizationId: user.organizationId },
    select: { id: true, name: true },
  });
  if (!job) return new Response("Job not found.", { status: 404 });

  const files = await db.file.findMany({
    where: {
      id: { in: fileIds },
      jobId: job.id,
      organizationId: user.organizationId,
      deletedAt: null,
    },
    select: { id: true, fileName: true, url: true },
  });
  if (files.length === 0) return new Response("No matching files.", { status: 404 });

  // Preserve request order when possible.
  const byId = new Map(files.map((file) => [file.id, file]));
  const ordered = fileIds.map((id) => byId.get(id)).filter((file): file is (typeof files)[number] => Boolean(file));
  const names = uniqueZipEntryNames(ordered.map((file) => file.fileName));

  const entries: { name: string; bytes: Uint8Array }[] = [];
  for (let i = 0; i < ordered.length; i++) {
    const file = ordered[i]!;
    try {
      entries.push({ name: names[i]!, bytes: await bytesForFileUrl(file.url) });
    } catch (error) {
      return new Response(
        error instanceof Error ? error.message : `Could not read ${file.fileName}.`,
        { status: 502 },
      );
    }
  }

  const zip = buildStoredZip(entries);
  const safeJob = job.name.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "") || "job";
  return new Response(Buffer.from(zip), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="inspection-photos-${safeJob}.zip"`,
    },
  });
}
