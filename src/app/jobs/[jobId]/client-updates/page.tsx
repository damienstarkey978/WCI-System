import Link from "next/link";
import { notFound } from "next/navigation";

import { SetupNotice } from "@/app/admin/setup-notice";
import { EmptyState } from "@/components/shell/EmptyState";
import { PageHeader } from "@/components/shell/PageHeader";
import { currentAppUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDateUtc } from "@/lib/format";

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
    <div className="mx-auto flex max-w-4xl flex-col gap-4 p-6">
      <PageHeader jobName={job.name} title="Client Updates" action={<GenerateSummaryButton jobId={job.id} />} />

      {summaries.length === 0 ? (
        <EmptyState
          title="Keep clients in the loop"
          description="Generate a weekly update from client-visible daily logs and schedule items. Nothing is emailed until you choose to share a link yourself."
          action={<GenerateSummaryButton jobId={job.id} />}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {summaries.map((summary) => {
            const title = `${formatDateUtc(summary.periodStart)} to ${formatDateUtc(summary.periodEnd)} update`;
            return (
              <article
                key={summary.id}
                className="flex flex-col overflow-hidden rounded-lg border bg-[var(--bt-panel-bg)]"
                style={{ borderColor: "var(--bt-border)" }}
              >
                <div className="flex h-28 items-end px-4 py-3" style={{ background: "color-mix(in srgb, var(--bt-primary) 12%, transparent)" }}>
                  <h2 className="text-base font-semibold text-[var(--bt-text)]">{title}</h2>
                </div>
                <div className="flex flex-1 flex-col gap-2 p-4">
                  <p className="text-sm font-medium text-[var(--bt-text)]">{summary.headline}</p>
                  <p className="line-clamp-4 text-sm text-[var(--bt-muted)]">{summary.body}</p>
                  {summary.highlights.length > 0 ? (
                    <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-[var(--bt-muted)]">
                      {summary.highlights.slice(0, 3).map((highlight, index) => (
                        <li key={index}>{highlight}</li>
                      ))}
                    </ul>
                  ) : null}
                  <div className="mt-auto flex items-center justify-between pt-2">
                    <span
                      className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                      style={{
                        background: "color-mix(in srgb, var(--bt-hazard) 18%, transparent)",
                        color: "var(--bt-hazard)",
                      }}
                    >
                      Ready for review
                    </span>
                    <Link href={`#update-${summary.id}`} className="text-xs font-medium text-[var(--bt-primary)] hover:underline">
                      Open
                    </Link>
                  </div>
                </div>
                <div id={`update-${summary.id}`} className="border-t px-4 py-3 text-sm" style={{ borderColor: "var(--bt-border)" }}>
                  <p className="whitespace-pre-wrap text-[var(--bt-text)]">{summary.body}</p>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
