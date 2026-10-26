import Link from "next/link";
import { notFound } from "next/navigation";

import { SetupNotice } from "@/app/admin/setup-notice";
import { PageHeader } from "@/components/shell/PageHeader";
import { currentAppUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatCents } from "@/lib/money";
import { formatDate, formatDateUtc } from "@/lib/format";

import { ScheduleAppointmentForm } from "../schedule-appointment-form";
import { WarrantyDetailForm } from "./detail-form";

export const dynamic = "force-dynamic";

const STATUS_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  SUBMITTED: { bg: "color-mix(in srgb, var(--bt-hazard) 14%, transparent)", text: "var(--bt-hazard)", label: "New" },
  SCHEDULED: { bg: "color-mix(in srgb, var(--bt-primary) 14%, transparent)", text: "var(--bt-primary)", label: "Scheduled" },
  IN_PROGRESS: { bg: "color-mix(in srgb, var(--bt-primary) 14%, transparent)", text: "var(--bt-primary)", label: "In progress" },
  COMPLETED: { bg: "var(--bt-status-open-bg)", text: "var(--bt-status-open-text)", label: "Completed" },
  CLOSED: { bg: "#e5e7eb", text: "#374151", label: "Closed" },
};

export default async function WarrantyClaimDetailPage({ params }: PageProps<"/jobs/[jobId]/warranties/[claimId]">) {
  const { jobId, claimId } = await params;

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

  const [claim, clients, vendors] = await Promise.all([
    db.warrantyClaim.findFirst({
      where: { id: claimId, jobId: job.id, organizationId: user.organizationId },
      include: {
        assignedVendor: { select: { id: true, name: true } },
        client: { select: { id: true, name: true } },
      },
    }),
    db.client.findMany({ where: { organizationId: user.organizationId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.vendor.findMany({ where: { organizationId: user.organizationId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  if (!claim) notFound();

  const badge = STATUS_STYLE[claim.status] ?? STATUS_STYLE.SUBMITTED;
  const editable = claim.status !== "CLOSED" && claim.status !== "COMPLETED";

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href={`/jobs/${job.id}/warranties`} className="text-xs font-medium text-[var(--bt-primary)] hover:underline">
            ← Warranties
          </Link>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <PageHeader jobName={job.name} title="Warranty claim" />
            <span className="rounded-full px-2 py-0.5 text-xs font-semibold" style={{ background: badge.bg, color: badge.text }}>
              {badge.label}
            </span>
          </div>
          <p className="mt-1 text-sm text-[var(--bt-muted)]">
            #{claim.claimNumber}
            {claim.priority ? ` · ${claim.priority}` : ""}
            {claim.followUpDate ? ` · Follow-up ${formatDateUtc(claim.followUpDate)}` : ""}
            {claim.addedCostCents > 0 ? ` · ${formatCents(claim.addedCostCents)}` : ""}
          </p>
        </div>
      </div>

      <WarrantyDetailForm
        jobId={job.id}
        claimId={claim.id}
        claimNumber={claim.claimNumber}
        editable={editable}
        clients={clients}
        initial={{
          title: claim.title,
          description: claim.description,
          category: claim.category ?? "",
          priority: claim.priority ?? "Low",
          classification: claim.classification ?? "",
          internalNotes: claim.internalNotes ?? "",
          addedCostCents: claim.addedCostCents,
          showClient: claim.showClient,
          followUpDate: claim.followUpDate ? claim.followUpDate.toISOString().slice(0, 10) : "",
          clientId: claim.clientId ?? "",
        }}
      />

      <div className="rounded-lg border bg-[var(--bt-panel-bg)] p-4" style={{ borderColor: "var(--bt-border)" }}>
        <h2 className="text-sm font-semibold text-[var(--bt-text)]">Service appointment</h2>
        {claim.appointmentAt ? (
          <div className="mt-2 space-y-1 text-sm text-[var(--bt-text)]">
            <p>
              <span className="text-[var(--bt-muted)]">When: </span>
              {formatDate(claim.appointmentAt)}
            </p>
            <p>
              <span className="text-[var(--bt-muted)]">Assigned to: </span>
              {claim.assignedVendor?.name ?? "Unassigned"}
            </p>
            {editable ? (
              <div className="pt-2">
                <ScheduleAppointmentForm jobId={job.id} claimId={claim.id} vendors={vendors} />
              </div>
            ) : null}
          </div>
        ) : (
          <div className="mt-3">
            <p className="mb-2 text-sm text-[var(--bt-muted)]">Keep track of upcoming appointments, or log services you have already completed.</p>
            {editable ? <ScheduleAppointmentForm jobId={job.id} claimId={claim.id} vendors={vendors} /> : null}
          </div>
        )}
      </div>

      <div className="rounded-lg border bg-[var(--bt-panel-bg)] p-4" style={{ borderColor: "var(--bt-border)" }}>
        <h2 className="text-sm font-semibold text-[var(--bt-text)]">Acceptance</h2>
        <div className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
          <p>
            <span className="text-[var(--bt-muted)]">Trade: </span>
            {claim.tradeAcceptedAt ? `${claim.tradeAcceptanceName ?? "Accepted"} · ${formatDate(claim.tradeAcceptedAt)}` : "Pending"}
          </p>
          <p>
            <span className="text-[var(--bt-muted)]">Client: </span>
            {claim.clientAcceptedAt ? `${claim.clientAcceptanceName ?? "Accepted"} · ${formatDate(claim.clientAcceptedAt)}` : "Pending"}
          </p>
        </div>
      </div>
    </div>
  );
}
