import { notFound } from "next/navigation";

import { SetupNotice } from "@/app/admin/setup-notice";
import { EmptyState } from "@/components/shell/EmptyState";
import { MailIcon } from "@/components/shell/icons";
import { PageHeader } from "@/components/shell/PageHeader";
import { resolvePrimaryClientEmail } from "@/lib/ai/weekly-summary-service";
import { currentAppUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDateUtc } from "@/lib/format";

import { GenerateSummaryButton } from "./generate-summary-button";
import { SummaryEditor } from "./summary-editor";

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

  const [summaries, primaryClient] = await Promise.all([
    db.clientUpdateSummary.findMany({
      where: { jobId: job.id },
      orderBy: { periodEnd: "desc" },
    }),
    resolvePrimaryClientEmail(user.organizationId, job.id),
  ]);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4 p-4 sm:p-6">
      <PageHeader jobName={job.name} title="Client Updates" action={<GenerateSummaryButton jobId={job.id} />} />

      {summaries.length === 0 ? (
        <EmptyState
          icon={<MailIcon className="h-10 w-10" />}
          title="Keep clients in the loop"
          description="Generate a weekly update from this job's client-visible daily logs and schedule items. Edit it in place, then Approve and Email to the primary client."
          action={<GenerateSummaryButton jobId={job.id} />}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-1 lg:grid-cols-2">
          {summaries.map((summary) => {
            const title = `${formatDateUtc(summary.periodStart)} to ${formatDateUtc(summary.periodEnd)} update`;
            return (
              <article
                key={summary.id}
                className="flex flex-col overflow-hidden rounded-lg border bg-[var(--bt-panel-bg)]"
                style={{ borderColor: "var(--bt-border)" }}
              >
                <div className="flex h-24 items-end px-4 py-3 sm:h-28" style={{ background: "color-mix(in srgb, var(--bt-primary) 12%, transparent)" }}>
                  <h2 className="text-base font-semibold text-[var(--bt-text)]">{title}</h2>
                </div>
                <div className="flex flex-1 flex-col gap-2 p-3 sm:p-4">
                  <p className="text-sm font-medium text-[var(--bt-text)]">{summary.headline}</p>
                  <p className="line-clamp-3 text-sm text-[var(--bt-muted)]">{summary.body}</p>
                </div>
                <SummaryEditor
                  jobId={job.id}
                  summary={summary}
                  primaryClientEmail={primaryClient?.email ?? null}
                />
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
