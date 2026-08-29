import Link from "next/link";
import { notFound } from "next/navigation";

import { SetupNotice } from "@/app/admin/setup-notice";
import { currentAppUser } from "@/lib/auth";
import { computeBidComparison } from "@/lib/bids/comparison";
import { db } from "@/lib/db";
import { formatDate, formatMoney } from "@/lib/format";

import { acceptBidSubmissionOnCompareAction, declineBidSubmissionOnCompareAction } from "./actions";
import { AiComparisonSummary } from "./ai-summary";
import { ClosePackageButtons } from "./close-package-buttons";
import { PushToPoForm } from "./push-to-po-form";

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

export default async function BidComparePage({ params }: PageProps<"/jobs/[jobId]/bids/[bidPackageId]/compare">) {
  const { jobId, bidPackageId } = await params;

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

  const [bidPackage, costCodes] = await Promise.all([
    db.bidPackage.findFirst({
      where: { id: bidPackageId, jobId: job.id, organizationId: user.organizationId },
      include: {
        lineItems: { orderBy: { sortOrder: "asc" } },
        submissions: { include: { vendor: true, lineItems: { orderBy: { sortOrder: "asc" } } }, orderBy: { invitedAt: "asc" } },
      },
    }),
    db.costCode.findMany({
      where: { organizationId: user.organizationId, isActive: true },
      orderBy: { sortOrder: "asc" },
      select: { id: true, code: true, name: true },
    }),
  ]);
  if (!bidPackage) notFound();

  const result = computeBidComparison(
    bidPackage.lineItems.map((line) => ({ id: line.id, title: line.title, unit: line.unit, quantityMilli: line.quantityMilli })),
    bidPackage.submissions.map((submission) => ({
      id: submission.id,
      vendorName: submission.vendor.name,
      status: submission.status,
      totalCents: submission.totalCents,
      notes: submission.notes,
      lineItems: submission.lineItems.map((line) => ({
        bidPackageLineItemId: line.bidPackageLineItemId,
        title: line.title,
        quantityMilli: line.quantityMilli,
        unitCostCents: line.unitCostCents,
      })),
    })),
  );

  const packageStyle = PACKAGE_STATUS_STYLE[bidPackage.status] ?? PACKAGE_STATUS_STYLE.OPEN;
  const hasAccepted = bidPackage.submissions.some((s) => s.status === "ACCEPTED");

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 p-6">
      <div>
        <Link href={`/jobs/${job.id}/bids`} className="text-xs font-medium text-[var(--bt-primary)] hover:underline">
          ← Bid board
        </Link>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold text-[var(--bt-text)]">Compare bids — {bidPackage.title}</h1>
            <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: packageStyle.bg, color: packageStyle.text }}>
              {bidPackage.status}
            </span>
          </div>
          <div className="mt-1 text-xs text-[var(--bt-muted)]">
            {job.name} · Due {formatDate(bidPackage.dueDate)}
          </div>
          {bidPackage.description ? <p className="mt-1 text-sm text-[var(--bt-muted)]">{bidPackage.description}</p> : null}
        </div>
        {bidPackage.status === "OPEN" ? (
          <ClosePackageButtons jobId={job.id} bidPackageId={bidPackage.id} hasAccepted={hasAccepted} />
        ) : null}
      </div>

      {result.columns.length === 0 ? (
        <p className="text-sm text-[var(--bt-muted)]">No vendors invited yet.</p>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border" style={{ borderColor: "var(--bt-border)" }}>
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead>
                <tr className="border-b" style={{ borderColor: "var(--bt-border)" }}>
                  <th className="sticky left-0 bg-[var(--bt-panel-bg)] p-3 text-left font-medium text-[var(--bt-muted)]">Line item</th>
                  {result.columns.map((column) => (
                    <th
                      key={column.submissionId}
                      className="min-w-[9rem] p-3 text-left font-medium"
                      style={{
                        background: column.submissionId === result.lowestTotalSubmissionId ? "var(--bt-status-open-bg)" : "var(--bt-panel-bg)",
                      }}
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="text-[var(--bt-text)]">{column.vendorName}</span>
                        {column.submissionId === result.lowestTotalSubmissionId ? (
                          <span className="rounded px-1 py-0.5 text-[9px] font-semibold" style={{ background: "var(--bt-status-open-text)", color: "white" }}>
                            LOWEST
                          </span>
                        ) : null}
                      </div>
                      {(() => {
                        const subStyle = SUBMISSION_STATUS_STYLE[column.status] ?? SUBMISSION_STATUS_STYLE.INVITED;
                        return (
                          <span
                            className="mt-0.5 inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold"
                            style={{ background: subStyle.bg, color: subStyle.text }}
                          >
                            {column.status}
                          </span>
                        );
                      })()}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.rows.map((row) => (
                  <tr key={row.lineItemId} className="border-b" style={{ borderColor: "var(--bt-border)" }}>
                    <td className="sticky left-0 bg-[var(--bt-panel-bg)] p-3 text-[var(--bt-text)]">
                      {row.title}
                      {row.unit || row.quantityMilli !== null ? (
                        <span className="ml-1 text-xs text-[var(--bt-muted)]">
                          ({row.quantityMilli !== null ? (row.quantityMilli / 1000).toString() : "—"} {row.unit ?? ""})
                        </span>
                      ) : null}
                    </td>
                    {result.columns.map((column) => {
                      const cell = row.cellsBySubmissionId[column.submissionId];
                      return (
                        <td key={column.submissionId} className="p-3 text-[var(--bt-text)]">
                          {cell === null || cell === undefined ? <span className="text-[var(--bt-muted)]">—</span> : formatMoney(cell)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
                <tr>
                  <td className="sticky left-0 bg-[var(--bt-panel-bg)] p-3 font-semibold text-[var(--bt-text)]">Total</td>
                  {result.columns.map((column) => (
                    <td
                      key={column.submissionId}
                      className="p-3 font-semibold"
                      style={{ color: column.submissionId === result.lowestTotalSubmissionId ? "var(--bt-status-open-text)" : "var(--bt-text)" }}
                    >
                      {column.totalCents === null ? <span className="font-normal text-[var(--bt-muted)]">—</span> : formatMoney(column.totalCents)}
                      {!column.isItemized && column.totalCents !== null ? (
                        <span className="ml-1 text-[10px] font-normal text-[var(--bt-muted)]">(flat)</span>
                      ) : null}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {bidPackage.submissions.map((submission) => {
              const column = result.columns.find((c) => c.submissionId === submission.id);
              const canDecide = submission.status === "SUBMITTED";
              return (
                <div key={submission.id} className="rounded-lg border bg-[var(--bt-panel-bg)] p-3 text-sm" style={{ borderColor: "var(--bt-border)" }}>
                  <div className="font-medium text-[var(--bt-text)]">{submission.vendor.name}</div>
                  {column && column.unmatchedItems.length > 0 ? (
                    <div className="mt-1 text-xs text-[var(--bt-muted)]">
                      Extra items: {column.unmatchedItems.map((item) => `${item.title} (${formatMoney(item.extendedCostCents)})`).join(", ")}
                    </div>
                  ) : null}
                  {submission.notes ? <p className="mt-1 text-xs text-[var(--bt-muted)]">Notes: {submission.notes}</p> : null}

                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {canDecide ? (
                      <>
                        <form action={acceptBidSubmissionOnCompareAction}>
                          <input type="hidden" name="jobId" value={job.id} />
                          <input type="hidden" name="bidPackageId" value={bidPackage.id} />
                          <input type="hidden" name="bidSubmissionId" value={submission.id} />
                          <button type="submit" className="text-xs font-medium text-[var(--bt-primary)] hover:underline">
                            Accept
                          </button>
                        </form>
                        <form action={declineBidSubmissionOnCompareAction}>
                          <input type="hidden" name="jobId" value={job.id} />
                          <input type="hidden" name="bidPackageId" value={bidPackage.id} />
                          <input type="hidden" name="bidSubmissionId" value={submission.id} />
                          <button type="submit" className="text-xs text-[var(--bt-muted)] hover:text-red-600 hover:underline">
                            Decline
                          </button>
                        </form>
                      </>
                    ) : null}
                    {submission.status === "ACCEPTED" ? (
                      <PushToPoForm jobId={job.id} bidPackageId={bidPackage.id} bidSubmissionId={submission.id} costCodes={costCodes} />
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      <AiComparisonSummary bidPackageId={bidPackage.id} />
    </div>
  );
}
