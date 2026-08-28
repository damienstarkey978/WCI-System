import { notFound } from "next/navigation";

import { SetupNotice } from "@/app/admin/setup-notice";
import { EmptyState } from "@/components/shell/EmptyState";
import { currentAppUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate, formatMoney } from "@/lib/format";

import { acceptBidSubmissionAction, declineBidSubmissionAction } from "./actions";
import { CreateBidPackageForm } from "./create-bid-package-form";
import { InviteVendorForm } from "./invite-vendor-form";
import { SubmitBidOnBehalfForm } from "./submit-bid-on-behalf-form";

export const dynamic = "force-dynamic";

const PACKAGE_STATUS_STYLE: Record<string, { bg: string; text: string }> = {
  OPEN: { bg: "#dbeafe", text: "#1e40af" },
  CLOSED: { bg: "#e5e7eb", text: "#374151" },
  AWARDED: { bg: "var(--bt-status-open-bg)", text: "var(--bt-status-open-text)" },
};

const SUBMISSION_STATUS_STYLE: Record<string, { bg: string; text: string }> = {
  INVITED: { bg: "#e5e7eb", text: "#374151" },
  DRAFT: { bg: "#e5e7eb", text: "#374151" },
  SUBMITTED: { bg: "#fef3c7", text: "#92400e" },
  ACCEPTED: { bg: "var(--bt-status-open-bg)", text: "var(--bt-status-open-text)" },
  DECLINED: { bg: "#fee2e2", text: "#991b1b" },
};

export default async function BidsPage({ params }: PageProps<"/jobs/[jobId]/bids">) {
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

  const [bidPackages, vendors] = await Promise.all([
    db.bidPackage.findMany({
      where: { jobId: job.id },
      orderBy: { createdAt: "desc" },
      include: { submissions: { include: { vendor: true } } },
    }),
    db.vendor.findMany({ where: { organizationId: user.organizationId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 p-6">
      <h1 className="text-xl font-semibold text-[var(--bt-text)]">Bid board — {job.name}</h1>

      <CreateBidPackageForm jobId={job.id} />

      {bidPackages.length === 0 ? (
        <EmptyState title="No bid packages yet" description="Bid packages sent out for this job will appear here." />
      ) : (
        <div className="flex flex-col gap-3">
          {bidPackages.map((pkg) => {
            const style = PACKAGE_STATUS_STYLE[pkg.status] ?? PACKAGE_STATUS_STYLE.OPEN;
            return (
              <div key={pkg.id} className="rounded-lg border bg-white p-4" style={{ borderColor: "var(--bt-border)" }}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="font-medium text-[var(--bt-text)]">{pkg.title}</div>
                    {pkg.description ? <p className="mt-0.5 text-sm text-[var(--bt-muted)]">{pkg.description}</p> : null}
                    <div className="mt-1 text-xs text-[var(--bt-muted)]">Due {formatDate(pkg.dueDate)}</div>
                  </div>
                  <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: style.bg, color: style.text }}>
                    {pkg.status}
                  </span>
                </div>

                {pkg.submissions.length === 0 ? (
                  <p className="mt-3 text-xs text-[var(--bt-muted)]">No vendors invited yet.</p>
                ) : (
                  <ul className="mt-3 divide-y" style={{ borderColor: "var(--bt-border)" }}>
                    {pkg.submissions.map((submission) => {
                      const subStyle = SUBMISSION_STATUS_STYLE[submission.status] ?? SUBMISSION_STATUS_STYLE.INVITED;
                      const canDecide = submission.status === "SUBMITTED";
                      const canEnterOnBehalf = submission.status === "INVITED" || submission.status === "DRAFT";
                      return (
                        <li key={submission.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-[var(--bt-text)]">{submission.vendor.name}</span>
                            <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: subStyle.bg, color: subStyle.text }}>
                              {submission.status}
                            </span>
                          </div>
                          <div className="flex items-center gap-3">
                            {submission.totalCents !== null ? <span className="text-[var(--bt-text)]">{formatMoney(submission.totalCents)}</span> : null}
                            {canEnterOnBehalf ? <SubmitBidOnBehalfForm jobId={job.id} bidSubmissionId={submission.id} /> : null}
                            {canDecide ? (
                              <div className="flex gap-2">
                                <form action={acceptBidSubmissionAction}>
                                  <input type="hidden" name="jobId" value={job.id} />
                                  <input type="hidden" name="bidSubmissionId" value={submission.id} />
                                  <button type="submit" className="text-xs font-medium text-[var(--bt-primary)] hover:underline">
                                    Accept
                                  </button>
                                </form>
                                <form action={declineBidSubmissionAction}>
                                  <input type="hidden" name="jobId" value={job.id} />
                                  <input type="hidden" name="bidSubmissionId" value={submission.id} />
                                  <button type="submit" className="text-xs text-[var(--bt-muted)] hover:text-red-600 hover:underline">
                                    Decline
                                  </button>
                                </form>
                              </div>
                            ) : null}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}

                {pkg.status === "OPEN" ? (
                  <div className="mt-3">
                    <InviteVendorForm
                      jobId={job.id}
                      bidPackageId={pkg.id}
                      vendors={vendors.filter((vendor) => !pkg.submissions.some((s) => s.vendorId === vendor.id))}
                    />
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
