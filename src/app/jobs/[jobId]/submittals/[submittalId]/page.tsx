import Link from "next/link";
import { notFound } from "next/navigation";

import { SetupNotice } from "@/app/admin/setup-notice";
import { PageHeader } from "@/components/shell/PageHeader";
import { currentAppUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate, formatDateUtc } from "@/lib/format";

import { AddRevisionForm } from "./add-revision-form";
import { IssueReviewLinkForm } from "./issue-review-link-form";
import { SubmittalDetailForm } from "./detail-form";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draft",
  PENDING: "Needs review",
  IN_APPROVAL: "In approval",
  APPROVED: "Approved",
  APPROVED_AS_NOTED: "Approved as noted",
  REVISE_AND_RESUBMIT: "Revise and resubmit",
  REJECTED: "Rejected",
  VOIDED: "Voided",
  AWAITING_DOCUMENTS: "Awaiting documents",
};

const STATUS_STYLE: Record<string, { bg: string; text: string }> = {
  DRAFT: { bg: "#e5e7eb", text: "#374151" },
  PENDING: { bg: "color-mix(in srgb, var(--bt-hazard) 14%, transparent)", text: "var(--bt-hazard)" },
  IN_APPROVAL: { bg: "color-mix(in srgb, var(--bt-primary) 14%, transparent)", text: "var(--bt-primary)" },
  APPROVED: { bg: "var(--bt-status-open-bg)", text: "var(--bt-status-open-text)" },
  APPROVED_AS_NOTED: { bg: "var(--bt-status-open-bg)", text: "var(--bt-status-open-text)" },
  REVISE_AND_RESUBMIT: { bg: "color-mix(in srgb, var(--bt-primary) 14%, transparent)", text: "var(--bt-primary)" },
  REJECTED: { bg: "color-mix(in srgb, var(--bt-danger) 14%, transparent)", text: "var(--bt-danger)" },
  VOIDED: { bg: "#e5e7eb", text: "#374151" },
  AWAITING_DOCUMENTS: { bg: "color-mix(in srgb, var(--bt-hazard) 14%, transparent)", text: "var(--bt-hazard)" },
};

export default async function SubmittalDetailPage({ params }: PageProps<"/jobs/[jobId]/submittals/[submittalId]">) {
  const { jobId, submittalId } = await params;

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

  const [submittal, users, vendors] = await Promise.all([
    db.submittal.findFirst({
      where: { id: submittalId, jobId: job.id, organizationId: user.organizationId },
      include: {
        revisions: { orderBy: { revisionNumber: "desc" } },
        reviewLinks: { orderBy: { createdAt: "desc" } },
        managerUser: { select: { id: true, name: true, email: true } },
        vendor: { select: { id: true, name: true } },
      },
    }),
    db.user.findMany({
      where: { organizationId: user.organizationId, isActive: true },
      orderBy: { email: "asc" },
      select: { id: true, email: true, name: true },
    }),
    db.vendor.findMany({
      where: { organizationId: user.organizationId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);
  if (!submittal) notFound();

  const badge = STATUS_STYLE[submittal.status] ?? STATUS_STYLE.PENDING;
  const editable = submittal.status !== "VOIDED" && submittal.status !== "APPROVED" && submittal.status !== "APPROVED_AS_NOTED";
  const numberLabel = String(submittal.number).padStart(4, "0");

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4 p-6">
      <div>
        <Link href={`/jobs/${job.id}/submittals`} className="text-xs font-medium text-[var(--bt-primary)] hover:underline">
          ← Submittals
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <PageHeader jobName={job.name} title="Submittal" />
          <span className="rounded-full px-2 py-0.5 text-xs font-semibold" style={{ background: badge.bg, color: badge.text }}>
            {STATUS_LABEL[submittal.status] ?? submittal.status}
          </span>
        </div>
        <p className="mt-1 text-sm text-[var(--bt-muted)]">
          #{numberLabel}
          {submittal.finalDueDate ? ` · Due ${formatDateUtc(submittal.finalDueDate)}` : ""}
          {submittal.managerUser ? ` · ${submittal.managerUser.name || submittal.managerUser.email}` : ""}
        </p>
      </div>

      <SubmittalDetailForm
        jobId={job.id}
        submittalId={submittal.id}
        numberLabel={numberLabel}
        editable={editable}
        users={users}
        vendors={vendors}
        initial={{
          title: submittal.title,
          type: submittal.type,
          description: submittal.description ?? "",
          packageName: submittal.packageName ?? "",
          division: submittal.division ?? "",
          specSection: submittal.specSection ?? "",
          finalDueDate: submittal.finalDueDate ? submittal.finalDueDate.toISOString().slice(0, 10) : "",
          managerUserId: submittal.managerUserId ?? "",
          vendorId: submittal.vendorId ?? "",
        }}
      />

      <div className="rounded-lg border bg-[var(--bt-panel-bg)] p-4" style={{ borderColor: "var(--bt-border)" }}>
        <h2 className="text-sm font-semibold text-[var(--bt-text)]">Documents / revisions</h2>
        {submittal.revisions.length === 0 ? (
          <p className="mt-2 text-sm text-[var(--bt-muted)]">No documents yet. Add a document link to create revision 1.</p>
        ) : (
          <ul className="mt-2 divide-y" style={{ borderColor: "var(--bt-border)" }}>
            {submittal.revisions.map((rev) => (
              <li key={rev.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2 text-sm">
                <div>
                  <span className="font-medium">Rev {rev.revisionNumber}</span>
                  <span className="text-[var(--bt-muted)]"> · {formatDate(rev.createdAt)}</span>
                  {rev.notes ? <p className="text-xs text-[var(--bt-muted)]">{rev.notes}</p> : null}
                </div>
                <a href={rev.documentUrl} target="_blank" rel="noreferrer" className="text-xs font-medium text-[var(--bt-primary)] hover:underline">
                  Open document
                </a>
              </li>
            ))}
          </ul>
        )}
        {editable ? (
          <div className="mt-3 border-t pt-3" style={{ borderColor: "var(--bt-border)" }}>
            <AddRevisionForm jobId={job.id} submittalId={submittal.id} />
          </div>
        ) : null}
      </div>

      <div className="rounded-lg border bg-[var(--bt-panel-bg)] p-4" style={{ borderColor: "var(--bt-border)" }}>
        <h2 className="text-sm font-semibold text-[var(--bt-text)]">External review</h2>
        <p className="mt-1 text-xs text-[var(--bt-muted)]">Issues a one-time review token. No email is sent; copy the token yourself.</p>
        {submittal.reviewLinks.length > 0 ? (
          <ul className="mt-2 space-y-1 text-sm">
            {submittal.reviewLinks.map((link) => (
              <li key={link.id}>
                {link.reviewerName} ({link.reviewerEmail})
                {link.decidedAt
                  ? ` · ${link.decision?.replace(/_/g, " ") ?? "decided"} ${formatDate(link.decidedAt)}`
                  : ` · pending · expires ${formatDate(link.expiresAt)}`}
              </li>
            ))}
          </ul>
        ) : null}
        {editable ? (
          <div className="mt-3">
            <IssueReviewLinkForm jobId={job.id} submittalId={submittal.id} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
