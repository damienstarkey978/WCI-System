import Link from "next/link";
import { notFound } from "next/navigation";

import { SetupNotice } from "@/app/admin/setup-notice";
import { PageHeader } from "@/components/shell/PageHeader";
import { currentAppUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { tradeLabel } from "@/lib/permitting/service";
import { listInspectionPictureFolders } from "@/lib/permitting/inspection-pictures";

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
        One folder per inspection on this job. Photo requirements link to Permit Rockstar guides.
      </p>

      {folders.length === 0 ? (
        <p className="rounded-lg border px-4 py-10 text-center text-sm text-[var(--bt-muted)]" style={{ borderColor: "var(--bt-border)" }}>
          No inspection folders yet. Open Permitting to seed job inspections first.
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {folders.map((folder) => (
            <li key={folder.folderId}>
              <Link
                href={`/jobs/${job.id}/files/inspection-pictures/${folder.folderId}`}
                className="flex flex-col gap-1 rounded-lg border bg-[var(--bt-panel-bg)] p-4 hover:border-[var(--bt-primary)]"
                style={{ borderColor: "var(--bt-border)" }}
              >
                <span className="text-sm font-semibold text-[var(--bt-text)]">{folder.name}</span>
                <span className="text-xs text-[var(--bt-muted)]">
                  {tradeLabel(folder.trade)} · {folder.photoCount} photo{folder.photoCount === 1 ? "" : "s"}
                  {folder.completedAt ? " · inspection marked complete" : ""}
                </span>
                {folder.requiresTermiteCertNote ? (
                  <span className="text-[11px] font-medium text-[var(--bt-hazard)]">
                    Slab: termite certificate required before pass (details from Damien later)
                  </span>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
