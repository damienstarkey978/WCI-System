import Link from "next/link";
import { notFound } from "next/navigation";

import { SetupNotice } from "@/app/admin/setup-notice";
import { PageHeader } from "@/components/shell/PageHeader";
import { appBaseUrl } from "@/lib/app-url";
import { currentAppUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { resolveFileUrlsSafe } from "@/lib/files/service";
import { getInspectionPictureFolder } from "@/lib/permitting/inspection-pictures";
import { tradeLabel } from "@/lib/permitting/service";

import { deleteInspectionFolderAction } from "../actions";
import { InspectionPhotoCapture } from "../photo-capture";
import { InspectionShareLinkButton } from "../share-link-button";

export const dynamic = "force-dynamic";

export default async function InspectionPictureFolderPage({
  params,
}: PageProps<"/jobs/[jobId]/files/inspection-pictures/[folderId]">) {
  const { jobId, folderId } = await params;

  let user;
  try {
    user = await currentAppUser();
  } catch (error) {
    return <SetupNotice detail={error instanceof Error ? error.message : String(error)} />;
  }
  if (!user) {
    return <SetupNotice detail="No organization found. Seed the database, then reload." />;
  }

  const job = await db.job.findFirst({ where: { id: jobId, organizationId: user.organizationId } });
  if (!job) notFound();

  const [folder, base] = await Promise.all([
    getInspectionPictureFolder(user.organizationId, job.id, folderId),
    appBaseUrl(),
  ]);
  if (!folder) notFound();

  const origin = base.replace(/\/+$/, "");
  const sharePath = folder.activeShareLink?.sharePath ?? null;

  const signedUrls = await resolveFileUrlsSafe(folder.files.map((file) => file.url));
  const photos = folder.files
    .map((file, index) => ({
      id: file.id,
      fileName: file.fileName,
      url: signedUrls[index] ?? null,
    }))
    .filter((file): file is { id: string; fileName: string; url: string } => Boolean(file.url));

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 p-4 sm:p-6">
      <div>
        <Link
          href={`/jobs/${job.id}/files/inspection-pictures`}
          className="text-xs font-medium text-[var(--bt-primary)] hover:underline"
        >
          All inspection folders
        </Link>
        <PageHeader
          jobName={job.name}
          title={folder.name}
          action={
            <form action={deleteInspectionFolderAction}>
              <input type="hidden" name="jobId" value={job.id} />
              <input type="hidden" name="folderId" value={folder.folderId} />
              <button
                type="submit"
                className="rounded border px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50"
                style={{ borderColor: "var(--bt-border)" }}
                title="Soft-deletes photos in this folder and removes the inspection from Permitting"
              >
                Delete folder
              </button>
            </form>
          }
        />
        <p className="-mt-2 text-sm text-[var(--bt-muted)]">{tradeLabel(folder.trade)} inspection photos</p>
      </div>

      {folder.requiresTermiteCertNote ? (
        <div className="rounded border px-3 py-2 text-sm" style={{ borderColor: "var(--bt-border)" }}>
          <label className="flex items-start gap-2 text-[var(--bt-text)]">
            <input type="checkbox" disabled className="mt-1" />
            <span>
              Termite certificate received (required before Slab can pass). Automate receive/upload and notify Garry later;
              Damien will provide the details.
            </span>
          </label>
        </div>
      ) : null}

      {(folder.tips.length > 0 || folder.guideUrl) && (
        <aside className="rounded-lg border bg-[var(--bt-panel-bg)] p-3 sm:p-4" style={{ borderColor: "var(--bt-border)" }}>
          <h2 className="text-sm font-semibold text-[var(--bt-text)]">Photo requirements</h2>
          {folder.tips.length > 0 ? (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-[var(--bt-muted)]">
              {folder.tips.map((tip) => (
                <li key={tip}>{tip}</li>
              ))}
            </ul>
          ) : null}
          {folder.guideUrl ? (
            <a
              href={folder.guideUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-block text-sm font-medium text-[var(--bt-primary)] hover:underline"
            >
              Open Permit Rockstar guide
            </a>
          ) : null}
        </aside>
      )}

      <section className="rounded-lg border bg-[var(--bt-panel-bg)] p-3 sm:p-4" style={{ borderColor: "var(--bt-border)" }}>
        <h2 className="mb-2 text-sm font-semibold text-[var(--bt-text)]">Share with inspector</h2>
        <p className="mb-3 text-xs text-[var(--bt-muted)]">
          Copy the share link and text it to the inspector yourself. Folder-only view/upload, no login. Rotate only if the URL leaked.
        </p>
        <InspectionShareLinkButton
          jobId={job.id}
          inspectionId={folder.inspectionId}
          inspectionName={folder.name}
          existingShareUrl={sharePath ? `${origin}${sharePath}` : null}
          existingExpiresAt={folder.activeShareLink?.expiresAt.toISOString() ?? null}
        />
      </section>

      <InspectionPhotoCapture jobId={job.id} folderId={folder.folderId} existing={photos} />
    </div>
  );
}
