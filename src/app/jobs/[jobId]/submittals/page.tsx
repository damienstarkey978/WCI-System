import { notFound } from "next/navigation";

import { SetupNotice } from "@/app/admin/setup-notice";
import { CreateModal } from "@/components/shell/CreateModal";
import { PageHeader } from "@/components/shell/PageHeader";
import { EmptyState } from "@/components/shell/EmptyState";
import { currentAppUser } from "@/lib/auth";
import { db } from "@/lib/db";

import { CreateSubmittalForm } from "./create-submittal-form";
import { SubmittalsGrid } from "./submittals-grid";

export const dynamic = "force-dynamic";

export default async function SubmittalsPage({ params }: PageProps<"/jobs/[jobId]/submittals">) {
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

  const submittals = await db.submittal.findMany({
    where: { jobId: job.id },
    orderBy: { createdAt: "desc" },
    include: { revisions: { orderBy: { revisionNumber: "desc" }, take: 1 } },
  });

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 p-6">
      <PageHeader
        jobName={job.name}
        title="Submittals"
        action={
          <div className="flex items-center gap-2">
            <CreateModal triggerLabel="+ Submittal" title="New submittal">
              <CreateSubmittalForm jobId={job.id} />
            </CreateModal>
          </div>
        }
      />


      {submittals.length === 0 ? (
        <EmptyState title="No submittals yet" description="Material specs and shop drawings for this job will appear here." />
      ) : (
        <SubmittalsGrid
          rows={submittals.map((submittal) => ({
            id: submittal.id,
            title: submittal.title,
            type: submittal.type,
            status: submittal.status,
            latestRevisionNumber: submittal.revisions[0]?.revisionNumber ?? null,
            latestRevisionAt: submittal.revisions[0] ? submittal.revisions[0].createdAt.toISOString() : null,
          }))}
        />
      )}
    </div>
  );
}
