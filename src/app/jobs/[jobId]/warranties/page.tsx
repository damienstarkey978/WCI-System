import Link from "next/link";
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

const TABS = [
  { key: "all", label: "All" },
  { key: "submitted", label: "New" },
  { key: "open", label: "Open" },
  { key: "completed", label: "Completed" },
  { key: "closed", label: "Closed" },
] as const;

export default async function WarrantiesPage({ params, searchParams }: PageProps<"/jobs/[jobId]/warranties">) {
  const { jobId } = await params;
  const { tab: tabParam } = await searchParams;
  const tab = TABS.some((t) => t.key === tabParam) ? (tabParam as (typeof TABS)[number]["key"]) : "all";

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

  const statusWhere =
    tab === "submitted"
      ? ({ status: "SUBMITTED" as const })
      : tab === "open"
        ? ({ status: { in: ["SCHEDULED" as const, "IN_PROGRESS" as const] } })
        : tab === "completed"
          ? ({ status: "COMPLETED" as const })
          : tab === "closed"
            ? ({ status: "CLOSED" as const })
            : {};

  const [claims, clients, vendors] = await Promise.all([
    db.warrantyClaim.findMany({
      where: { jobId: job.id, ...statusWhere },
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
          <CreateModal triggerLabel="+ Warranty claim" title="New warranty claim" size="lg">
            <CreateClaimForm jobId={job.id} clients={clients} />
          </CreateModal>
        }
      />

      <nav className="flex gap-1 border-b" style={{ borderColor: "var(--bt-border)" }}>
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/jobs/${job.id}/warranties${t.key === "all" ? "" : `?tab=${t.key}`}`}
            className="-mb-px border-b-2 px-3 py-2 text-sm font-medium transition"
            style={{
              borderColor: t.key === tab ? "var(--bt-primary)" : "transparent",
              color: t.key === tab ? "var(--bt-primary)" : "var(--bt-muted)",
            }}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {claims.length === 0 ? (
        <EmptyState
          title="Track warranty claims"
          description="Manage claims from creation through completion with warranties."
          action={
            <CreateModal triggerLabel="Add a Warranty Claim" title="New warranty claim" size="lg">
              <CreateClaimForm jobId={job.id} clients={clients} />
            </CreateModal>
          }
        />
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
            priority: claim.priority,
            category: claim.category,
            createdAt: claim.createdAt.toISOString(),
            assignedVendor: claim.assignedVendor?.name ?? null,
            appointmentAt: claim.appointmentAt ? claim.appointmentAt.toISOString() : null,
          }))}
        />
      )}
    </div>
  );
}
