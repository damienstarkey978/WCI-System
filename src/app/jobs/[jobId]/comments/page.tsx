import Link from "next/link";
import { notFound } from "next/navigation";

import { SetupNotice } from "@/app/admin/setup-notice";
import { EmptyState } from "@/components/shell/EmptyState";
import { currentAppUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

interface CommentRow {
  readonly id: string;
  readonly sourceLabel: string;
  readonly sourceHref: string;
  readonly authorLabel: string;
  readonly body: string;
  readonly createdAt: Date;
}

/**
 * "Comments" (Buildertrend screenshot gap-analysis pass) — distinct from Messages
 * (the job-level client-facing thread at src/app/jobs/[jobId]/messages): this is a
 * read-only, job-scoped rollup of the internal discussion threads already wired to
 * this job's own records via the unified Comment layer (src/lib/comments/service.ts)
 * — currently Invoices and Proposals, the two job-linked entities with a
 * CommentThread embedded on their own page. Posting still happens on each record's
 * page; this is "see everything discussed on this job at a glance."
 */
export default async function JobCommentsPage({ params }: PageProps<"/jobs/[jobId]/comments">) {
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

  const job = await db.job.findFirst({ where: { id: jobId, organizationId: user.organizationId }, select: { id: true, name: true } });
  if (!job) notFound();

  const [invoices, proposals] = await Promise.all([
    db.invoice.findMany({ where: { jobId: job.id }, select: { id: true, invoiceNumber: true } }),
    db.proposal.findMany({ where: { jobId: job.id }, select: { id: true, title: true } }),
  ]);

  const comments = await db.comment.findMany({
    where: {
      organizationId: user.organizationId,
      OR: [
        { featureType: "Invoice", featureId: { in: invoices.map((i) => i.id) } },
        { featureType: "Proposal", featureId: { in: proposals.map((p) => p.id) } },
      ],
    },
    include: { authorUser: { select: { name: true, email: true } } },
    orderBy: { createdAt: "desc" },
  });

  const invoiceById = new Map(invoices.map((invoice) => [invoice.id, invoice]));
  const proposalById = new Map(proposals.map((proposal) => [proposal.id, proposal]));

  const rows: CommentRow[] = comments.map((comment) => {
    const isInvoice = comment.featureType === "Invoice";
    const invoice = isInvoice ? invoiceById.get(comment.featureId) : undefined;
    const proposal = !isInvoice ? proposalById.get(comment.featureId) : undefined;
    return {
      id: comment.id,
      sourceLabel: isInvoice ? `Invoice ${invoice?.invoiceNumber ?? comment.featureId}` : `Proposal "${proposal?.title ?? comment.featureId}"`,
      sourceHref: isInvoice ? `/jobs/${job.id}/invoices/${comment.featureId}` : `/leads/proposals/${comment.featureId}`,
      authorLabel: comment.authorUser?.name ?? comment.authorUser?.email ?? "Unknown",
      body: comment.body,
      createdAt: comment.createdAt,
    };
  });

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 p-6">
      <h1 className="text-xl font-semibold text-[var(--bt-text)]">Comments — {job.name}</h1>

      {rows.length === 0 ? (
        <EmptyState title="No comments yet" description="Internal discussion left on this job's invoices and proposals will appear here." />
      ) : (
        <div className="flex flex-col gap-3">
          {rows.map((row) => (
            <div key={row.id} className="rounded-lg border bg-[var(--bt-panel-bg)] p-4" style={{ borderColor: "var(--bt-border)" }}>
              <div className="flex items-center justify-between text-xs text-[var(--bt-muted)]">
                <Link href={row.sourceHref} className="font-semibold text-[var(--bt-primary)] hover:underline">
                  {row.sourceLabel}
                </Link>
                <span>{formatDate(row.createdAt)}</span>
              </div>
              <p className="mt-1.5 text-sm text-[var(--bt-text)]">{row.body}</p>
              <p className="mt-1 text-xs text-[var(--bt-muted)]">— {row.authorLabel}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
