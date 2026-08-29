import { notFound } from "next/navigation";

import { SetupNotice } from "@/app/admin/setup-notice";
import { EmptyState } from "@/components/shell/EmptyState";
import { currentAppUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/format";

import { GenerateSummaryButton } from "./generate-summary-button";

export const dynamic = "force-dynamic";

export default async function ClientUpdatesPage({ params }: PageProps<"/jobs/[jobId]/client-updates">) {
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

  const summaries = await db.clientUpdateSummary.findMany({
    where: { jobId: job.id },
    orderBy: { periodEnd: "desc" },
  });

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold text-[var(--bt-text)]">Client updates — {job.name}</h1>
        <GenerateSummaryButton jobId={job.id} />
      </div>

      {summaries.length === 0 ? (
        <EmptyState title="No client updates yet" description="Weekly AI-generated client update summaries for this job will appear here." />
      ) : (
        <div className="flex flex-col gap-4">
          {summaries.map((summary) => (
            <article key={summary.id} className="rounded-lg border bg-[var(--bt-panel-bg)] p-4" style={{ borderColor: "var(--bt-border)" }}>
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-[var(--bt-text)]">{summary.headline}</h2>
                <span className="text-xs text-[var(--bt-muted)]">
                  {formatDate(summary.periodStart)} – {formatDate(summary.periodEnd)}
                </span>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm text-[var(--bt-text)]">{summary.body}</p>
              {summary.highlights.length > 0 ? (
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-[var(--bt-muted)]">
                  {summary.highlights.map((highlight, index) => (
                    <li key={index}>{highlight}</li>
                  ))}
                </ul>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
