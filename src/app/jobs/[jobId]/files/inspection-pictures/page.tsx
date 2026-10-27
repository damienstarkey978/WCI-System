import Link from "next/link";
import { notFound } from "next/navigation";

import { SetupNotice } from "@/app/admin/setup-notice";
import { EmptyState } from "@/components/shell/EmptyState";
import { PhotoIcon } from "@/components/shell/icons";
import { PageHeader } from "@/components/shell/PageHeader";
import { currentAppUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { tradeLabel } from "@/lib/permitting/service";
import { listInspectionPictureFolders } from "@/lib/permitting/inspection-pictures";

import { InspectionShareLinkButton } from "./share-link-button";

export const dynamic = "force-dynamic";

export default async function InspectionPicturesPage({
  params,
}: PageProps<"/jobs/[jobId]/files/inspection-pictures">) {
  const { jobId } = await params;

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

  const folders = await listInspectionPictureFolders(user.organizationId, job.id);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 p-4 sm:p-6">
      <PageHeader jobName={job.name} title="Inspection Pictures" />
      <p className="-mt-2 text-sm text-[var(--bt-muted)]">
        Folders for inspections required on this job only. Add or remove inspections on{" "}
        <Link href={`/jobs/${job.id}/permitting`} className="font-medium text-[var(--bt-primary)] hover:underline">
          Permitting
        </Link>
        . Each folder has an inspector share link (no login).
      </p>

      {folders.length === 0 ? (
        <EmptyState
          icon={<PhotoIcon className="h-10 w-10" />}
          title="No inspection folders yet"
          description="Add the inspections this job needs on Permitting — folders appear here automatically."
          action={
            <Link
              href={`/jobs/${job.id}/permitting`}
              className="rounded px-3 py-2 text-sm font-semibold text-[var(--bt-on-primary)]"
              style={{ background: "var(--bt-primary)" }}
            >
              Open Permitting
            </Link>
          }
        />
      ) : (
        <ul className="grid gap-3">
          {folders.map((folder) => (
            <li
              key={folder.folderId}
              className="rounded-lg border bg-[var(--bt-panel-bg)] p-4"
              style={{ borderColor: "var(--bt-border)" }}
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <Link
                  href={`/jobs/${job.id}/files/inspection-pictures/${folder.folderId}`}
                  className="min-w-0 flex-1 hover:opacity-90"
                >
                  <span className="block text-sm font-semibold text-[var(--bt-text)]">{folder.name}</span>
                  <span className="mt-0.5 block text-xs text-[var(--bt-muted)]">
                    {tradeLabel(folder.trade)} · {folder.photoCount} photo{folder.photoCount === 1 ? "" : "s"}
                    {folder.completedAt ? " · inspection marked complete" : ""}
                  </span>
                  {folder.requiresTermiteCertNote ? (
                    <span className="mt-1 block text-[11px] font-medium text-[var(--bt-hazard)]">
                      Slab: termite certificate required before pass (details from Damien later)
                    </span>
                  ) : null}
                </Link>
                <Link
                  href={`/jobs/${job.id}/files/inspection-pictures/${folder.folderId}`}
                  className="inline-flex w-full items-center justify-center rounded border px-3 py-2.5 text-xs font-semibold text-[var(--bt-text)] sm:w-auto sm:py-1.5"
                  style={{ borderColor: "var(--bt-border)" }}
                >
                  Open folder
                </Link>
              </div>
              <div className="mt-3 border-t pt-3" style={{ borderColor: "var(--bt-border)" }}>
                <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-[var(--bt-muted)]">
                  Inspector link
                </p>
                <InspectionShareLinkButton
                  jobId={job.id}
                  inspectionId={folder.inspectionId}
                  inspectionName={folder.name}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
