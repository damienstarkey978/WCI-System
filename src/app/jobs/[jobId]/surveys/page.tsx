import { notFound } from "next/navigation";

import { SetupNotice } from "@/app/admin/setup-notice";
import { EmptyState } from "@/components/shell/EmptyState";
import { currentAppUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/format";

import { CreateSurveyForm } from "./create-survey-form";
import { IssueLinkForm } from "./issue-link-form";

export const dynamic = "force-dynamic";

const TOUCHPOINT_LABEL: Record<string, string> = {
  PRE_PROJECT: "Pre-project",
  MID_PROJECT: "Mid-project",
  POST_COMPLETION: "Post-completion",
};

export default async function SurveysPage({ params }: PageProps<"/jobs/[jobId]/surveys">) {
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

  const surveys = await db.survey.findMany({
    where: { jobId: job.id },
    orderBy: { createdAt: "desc" },
    include: { questions: { orderBy: { sortOrder: "asc" } }, responseLinks: { orderBy: { createdAt: "desc" } } },
  });

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4 p-6">
      <h1 className="text-xl font-semibold text-[var(--bt-text)]">Surveys — {job.name}</h1>

      <CreateSurveyForm jobId={job.id} />

      {surveys.length === 0 ? (
        <EmptyState title="No surveys yet" description="Client satisfaction surveys created for this job will appear here." />
      ) : (
        <div className="flex flex-col gap-3">
          {surveys.map((survey) => {
            const submitted = survey.responseLinks.filter((link) => link.submittedAt !== null);
            const pending = survey.responseLinks.filter((link) => link.submittedAt === null);
            return (
              <article key={survey.id} className="rounded-lg border bg-white p-4" style={{ borderColor: "var(--bt-border)" }}>
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold text-[var(--bt-text)]">{survey.title}</h2>
                  <span className="rounded bg-black/5 px-1.5 py-0.5 text-[10px] font-semibold text-[var(--bt-muted)]">
                    {TOUCHPOINT_LABEL[survey.touchpoint] ?? survey.touchpoint}
                  </span>
                </div>
                <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs text-[var(--bt-muted)]">
                  {survey.questions.map((question) => (
                    <li key={question.id}>{question.prompt}</li>
                  ))}
                </ul>

                {submitted.length > 0 ? (
                  <div className="mt-3 divide-y" style={{ borderColor: "var(--bt-border)" }}>
                    {submitted.map((link) => (
                      <div key={link.id} className="py-2 text-sm">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-[var(--bt-text)]">{link.recipientName ?? link.recipientEmail ?? "Anonymous"}</span>
                          <span className="text-xs text-[var(--bt-muted)]">{formatDate(link.submittedAt)}</span>
                        </div>
                        <dl className="mt-1 space-y-1 text-xs text-[var(--bt-muted)]">
                          {survey.questions.map((question) => {
                            const answers = (link.answers as Record<string, string> | null) ?? {};
                            const answer = answers[question.id];
                            if (!answer) return null;
                            return (
                              <div key={question.id}>
                                <dt className="font-medium text-[var(--bt-text)]">{question.prompt}</dt>
                                <dd>{answer}</dd>
                              </div>
                            );
                          })}
                        </dl>
                      </div>
                    ))}
                  </div>
                ) : null}

                {pending.length > 0 ? <p className="mt-2 text-xs text-[var(--bt-muted)]">{pending.length} link(s) sent, awaiting response.</p> : null}

                <div className="mt-2">
                  <IssueLinkForm jobId={job.id} surveyId={survey.id} />
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
