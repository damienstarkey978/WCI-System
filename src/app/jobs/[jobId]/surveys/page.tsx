import Link from "next/link";
import { notFound } from "next/navigation";

import { SetupNotice } from "@/app/admin/setup-notice";
import { CreateModal } from "@/components/shell/CreateModal";
import { PageHeader } from "@/components/shell/PageHeader";
import { EmptyState } from "@/components/shell/EmptyState";
import { ChatIcon } from "@/components/shell/icons";
import { currentAppUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate, formatDateUtc } from "@/lib/format";

import { CreateSurveyForm } from "./create-survey-form";
import { IssueLinkForm } from "./issue-link-form";

export const dynamic = "force-dynamic";

const VIEW_TABS = [
  { key: "individual", label: "Individual" },
  { key: "grouped", label: "Grouped" },
  { key: "questions", label: "Questions" },
] as const;

const TOUCHPOINT_LABEL: Record<string, string> = {
  PRE_PROJECT: "Pre-project",
  MID_PROJECT: "Mid-project",
  POST_COMPLETION: "Post-completion",
};

function surveyStatus(responseLinks: readonly { submittedAt: Date | null }[]): { label: string; bg: string; text: string } {
  if (responseLinks.length === 0) {
    return { label: "Unreleased", bg: "#e5e7eb", text: "#374151" };
  }
  const submitted = responseLinks.filter((l) => l.submittedAt !== null).length;
  if (submitted === responseLinks.length) {
    return { label: "Completed", bg: "var(--bt-status-open-bg)", text: "var(--bt-status-open-text)" };
  }
  if (submitted > 0) {
    return { label: "Partial", bg: "color-mix(in srgb, var(--bt-primary) 14%, transparent)", text: "var(--bt-primary)" };
  }
  return { label: "Released", bg: "color-mix(in srgb, var(--bt-hazard) 14%, transparent)", text: "var(--bt-hazard)" };
}

export default async function SurveysPage({ params, searchParams }: PageProps<"/jobs/[jobId]/surveys">) {
  const { jobId } = await params;
  const { tab: tabParam } = await searchParams;
  const view = VIEW_TABS.some((t) => t.key === tabParam) ? (tabParam as (typeof VIEW_TABS)[number]["key"]) : "individual";

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

  const [surveys, clients] = await Promise.all([
    db.survey.findMany({
      where: { jobId: job.id },
      orderBy: { createdAt: "desc" },
      include: {
        questions: { orderBy: { sortOrder: "asc" } },
        responseLinks: { orderBy: { createdAt: "desc" } },
        client: { select: { name: true } },
      },
    }),
    db.client.findMany({
      where: { organizationId: user.organizationId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  const createModal = (
    <CreateModal triggerLabel="+ Survey" title="New survey" size="lg">
      <CreateSurveyForm jobId={job.id} clients={clients} />
    </CreateModal>
  );

  const questionLibrary = Array.from(
    new Map(
      surveys.flatMap((s) => s.questions.map((q) => [q.prompt.toLowerCase(), q.prompt] as const)),
    ).values(),
  ).sort((a, b) => a.localeCompare(b));

  const grouped = Array.from(
    surveys.reduce((map, survey) => {
      const key = survey.title;
      const entry = map.get(key) ?? { title: key, count: 0, responses: 0 };
      entry.count += 1;
      entry.responses += survey.responseLinks.filter((l) => l.submittedAt).length;
      map.set(key, entry);
      return map;
    }, new Map<string, { title: string; count: number; responses: number }>()),
  ).map(([, v]) => v);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4 p-6">
      <PageHeader jobName={job.name} title="Surveys" action={createModal} />

      <nav className="flex gap-1 border-b" style={{ borderColor: "var(--bt-border)" }}>
        {VIEW_TABS.map((t) => (
          <Link
            key={t.key}
            href={`/jobs/${job.id}/surveys${t.key === "individual" ? "" : `?tab=${t.key}`}`}
            className="-mb-px border-b-2 px-3 py-2 text-sm font-medium transition"
            style={{
              borderColor: t.key === view ? "var(--bt-primary)" : "transparent",
              color: t.key === view ? "var(--bt-primary)" : "var(--bt-muted)",
            }}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {view === "questions" ? (
        questionLibrary.length === 0 ? (
          <EmptyState
            icon={<ChatIcon className="h-10 w-10" />}
            title="No questions yet"
            description="Questions from saved surveys will appear here as a library."
            action={createModal}
          />
        ) : (
          <ul className="divide-y rounded-lg border bg-[var(--bt-panel-bg)]" style={{ borderColor: "var(--bt-border)" }}>
            {questionLibrary.map((prompt) => (
              <li key={prompt} className="px-4 py-3 text-sm text-[var(--bt-text)]">
                {prompt}
              </li>
            ))}
          </ul>
        )
      ) : view === "grouped" ? (
        grouped.length === 0 ? (
          <EmptyState
            icon={<ChatIcon className="h-10 w-10" />}
            title="Hear from your customers with Surveys"
            description="Group identical survey titles to see response totals across releases."
            action={
              <CreateModal triggerLabel="Add a Survey" title="New survey" size="lg">
                <CreateSurveyForm jobId={job.id} clients={clients} />
              </CreateModal>
            }
          />
        ) : (
          <ul className="divide-y rounded-lg border bg-[var(--bt-panel-bg)]" style={{ borderColor: "var(--bt-border)" }}>
            {grouped.map((g) => (
              <li key={g.title} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <span className="font-medium text-[var(--bt-text)]">{g.title}</span>
                <span className="text-xs text-[var(--bt-muted)]">
                  {g.count} survey{g.count === 1 ? "" : "s"} · {g.responses} response{g.responses === 1 ? "" : "s"}
                </span>
              </li>
            ))}
          </ul>
        )
      ) : surveys.length === 0 ? (
        <EmptyState
          icon={<ChatIcon className="h-10 w-10" />}
          title="Hear from your customers with Surveys"
          description="Collect feedback at key points in the job with surveys."
          action={
            <CreateModal triggerLabel="Add a Survey" title="New survey" size="lg">
              <CreateSurveyForm jobId={job.id} clients={clients} />
            </CreateModal>
          }
        />
      ) : (
        <div className="flex flex-col gap-3">
          {surveys.map((survey) => {
            const submitted = survey.responseLinks.filter((link) => link.submittedAt !== null);
            const pending = survey.responseLinks.filter((link) => link.submittedAt === null);
            const status = surveyStatus(survey.responseLinks);
            return (
              <article key={survey.id} className="rounded-lg border bg-[var(--bt-panel-bg)] p-4" style={{ borderColor: "var(--bt-border)" }}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold text-[var(--bt-text)]">{survey.title}</h2>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: status.bg, color: status.text }}>
                      {status.label}
                    </span>
                    <span className="rounded bg-black/5 px-1.5 py-0.5 text-[10px] font-semibold text-[var(--bt-muted)]">
                      {TOUCHPOINT_LABEL[survey.touchpoint] ?? survey.touchpoint}
                    </span>
                  </div>
                </div>
                <p className="mt-1 text-xs text-[var(--bt-muted)]">
                  {survey.client?.name ? `${survey.client.name} · ` : ""}
                  {survey.releaseAt ? `Release ${formatDateUtc(survey.releaseAt)}` : "No release date"}
                  {` · ${survey.questions.length} question${survey.questions.length === 1 ? "" : "s"}`}
                </p>
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

                {pending.length > 0 ? (
                  <p className="mt-2 text-xs text-[var(--bt-muted)]">{pending.length} link(s) issued, awaiting response.</p>
                ) : null}

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
