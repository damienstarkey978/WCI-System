import { notFound } from "next/navigation";

import { SetupNotice } from "@/app/admin/setup-notice";
import { EmptyState } from "@/components/shell/EmptyState";
import { currentAppUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/format";

import { CreateClaimForm } from "./create-claim-form";
import { ScheduleAppointmentForm } from "./schedule-appointment-form";

export const dynamic = "force-dynamic";

const STATUS_STYLE: Record<string, { bg: string; text: string }> = {
  SUBMITTED: { bg: "#fef3c7", text: "#92400e" },
  SCHEDULED: { bg: "#e0e7ff", text: "#3730a3" },
  IN_PROGRESS: { bg: "#e0e7ff", text: "#3730a3" },
  COMPLETED: { bg: "var(--bt-status-open-bg)", text: "var(--bt-status-open-text)" },
  CLOSED: { bg: "#e5e7eb", text: "#374151" },
};

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
    <div className="mx-auto flex max-w-4xl flex-col gap-4 p-6">
      <h1 className="text-xl font-semibold text-[var(--bt-text)]">Warranties — {job.name}</h1>

      <CreateClaimForm jobId={job.id} clients={clients} />

      {claims.length === 0 ? (
        <EmptyState title="No warranty claims yet" description="Claims submitted for this job will appear here." />
      ) : (
        <div className="flex flex-col gap-3">
          {claims.map((claim) => {
            const style = STATUS_STYLE[claim.status] ?? STATUS_STYLE.SUBMITTED;
            return (
              <article key={claim.id} className="rounded-lg border bg-[var(--bt-panel-bg)] p-4" style={{ borderColor: "var(--bt-border)" }}>
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold text-[var(--bt-text)]">
                    {claim.claimNumber} — {claim.title}
                  </h2>
                  <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: style.bg, color: style.text }}>
                    {claim.status.replace(/_/g, " ")}
                  </span>
                </div>
                <p className="mt-1 text-sm text-[var(--bt-muted)]">{claim.description}</p>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--bt-muted)]">
                  <span>Submitted {formatDate(claim.createdAt)}</span>
                  {claim.assignedVendor ? <span>Assigned to {claim.assignedVendor.name}</span> : null}
                  {claim.appointmentAt ? <span>Appointment {formatDate(claim.appointmentAt)}</span> : null}
                </div>
                {claim.status === "SUBMITTED" ? (
                  <div className="mt-2">
                    <ScheduleAppointmentForm jobId={job.id} claimId={claim.id} vendors={vendors} />
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
