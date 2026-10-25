import { notFound } from "next/navigation";

import { SetupNotice } from "@/app/admin/setup-notice";
import { CreateModal } from "@/components/shell/CreateModal";
import { PageHeader } from "@/components/shell/PageHeader";
import { EmptyState } from "@/components/shell/EmptyState";
import { currentAppUser } from "@/lib/auth";
import { db } from "@/lib/db";

import { ClaimsGrid } from "./claims-grid";
import { CreateClaimForm } from "./create-claim-form";

export const dynamic = "force-dynamic";

export default async function WarrantiesPage({ params }: PageProps<"/jobs/[jobId]/warranties">) {
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

  const [claims, clients, vendors] = await Promise.all([
    db.warrantyClaim.findMany({
      where: { jobId: job.id },
      orderBy: { createdAt: "desc" },
      include: { assignedVendor: true },
    }),
    db.client.findMany({ where: { organizationId: user.organizationId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.vendor.findMany({ where: { organizationId: user.organizationId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 p-6">
      <PageHeader
        jobName={job.name}
        title="Warranties"
        action={
          <div className="flex items-center gap-2">
            <CreateModal triggerLabel="+ Warranty claim" title="New warranty claim">
              <CreateClaimForm jobId={job.id} clients={clients} />
            </CreateModal>
          </div>
        }
      />


      {claims.length === 0 ? (
        <EmptyState title="No warranty claims yet" description="Claims submitted for this job will appear here." />
      ) : (
        <ClaimsGrid
          vendors={vendors}
          rows={claims.map((claim) => ({
            id: claim.id,
            jobId: job.id,
            claimNumber: claim.claimNumber,
            title: claim.title,
            description: claim.description,
            status: claim.status,
            createdAt: claim.createdAt.toISOString(),
            assignedVendor: claim.assignedVendor?.name ?? null,
            appointmentAt: claim.appointmentAt ? claim.appointmentAt.toISOString() : null,
          }))}
        />
      )}
    </div>
  );
}
