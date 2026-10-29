import Link from "next/link";
import { PageHeader } from "@/components/shell/PageHeader";
import { notFound } from "next/navigation";

import { SetupNotice } from "@/app/admin/setup-notice";
import { actorSummaryText } from "@/components/actor-attribution";
import { EmptyState } from "@/components/shell/EmptyState";
import { ChatIcon } from "@/components/shell/icons";
import { currentAppUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { logHeading } from "@/lib/daily-logs/display";

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
 * read-only, job-scoped rollup of the unified Comment layer
 * (src/lib/comments/service.ts). Includes Invoices, Proposals, and Daily Logs —
 * the job-linked entities that already embed CommentThread / daily-log comments.
 * Posting still happens on each record's page; this is "see everything discussed
 * on this job at a glance."
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

  const [invoices, proposals, dailyLogs] = await Promise.all([
    db.invoice.findMany({ where: { jobId: job.id }, select: { id: true, invoiceNumber: true } }),
    db.proposal.findMany({ where: { jobId: job.id }, select: { id: true, title: true } }),
    db.dailyLog.findMany({ where: { jobId: job.id }, select: { id: true, title: true, createdAt: true } }),
  ]);

  const comments = await db.comment.findMany({
    where: {
      organizationId: user.organizationId,
      OR: [
        { featureType: "Invoice", featureId: { in: invoices.map((i) => i.id) } },
        { featureType: "Proposal", featureId: { in: proposals.map((p) => p.id) } },
        { featureType: "DailyLog", featureId: { in: dailyLogs.map((log) => log.id) } },
      ],
    },
    include: {
      authorUser: { select: { name: true, email: true } },
      authorApiKey: { select: { name: true, agentKind: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const invoiceById = new Map(invoices.map((invoice) => [invoice.id, invoice]));
  const proposalById = new Map(proposals.map((proposal) => [proposal.id, proposal]));
  const dailyLogById = new Map(dailyLogs.map((log) => [log.id, log]));

  const rows: CommentRow[] = comments.map((comment) => {
    if (comment.featureType === "Invoice") {
      const invoice = invoiceById.get(comment.featureId);
      return {
        id: comment.id,
        sourceLabel: `Invoice ${invoice?.invoiceNumber ?? comment.featureId}`,
        sourceHref: `/jobs/${job.id}/invoices/${comment.featureId}`,
        authorLabel: actorSummaryText({ user: comment.authorUser, apiKey: comment.authorApiKey }),
        body: comment.body,
        createdAt: comment.createdAt,
      };
    }
    if (comment.featureType === "DailyLog") {
      const log = dailyLogById.get(comment.featureId);
      return {
        id: comment.id,
        sourceLabel: log ? `Daily Log — ${logHeading(log.createdAt, log.title)}` : `Daily Log ${comment.featureId}`,
        sourceHref: `/jobs/${job.id}/daily-logs/${comment.featureId}`,
        authorLabel: actorSummaryText({ user: comment.authorUser, apiKey: comment.authorApiKey }),
        body: comment.body,
        createdAt: comment.createdAt,
      };
    }
    const proposal = proposalById.get(comment.featureId);
    return {
      id: comment.id,
      sourceLabel: `Proposal "${proposal?.title ?? comment.featureId}"`,
      sourceHref: `/leads/proposals/${comment.featureId}`,
      authorLabel: actorSummaryText({ user: comment.authorUser, apiKey: comment.authorApiKey }),
      body: comment.body,
      createdAt: comment.createdAt,
    };
  });

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 p-6">
      <PageHeader jobName={job.name} title="Comments" />

      {rows.length === 0 ? (
        <EmptyState
          icon={<ChatIcon className="h-10 w-10" />}
          title="No comments yet"
          description="Internal discussion on this job's daily logs, invoices, and proposals will appear here."
        />
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
