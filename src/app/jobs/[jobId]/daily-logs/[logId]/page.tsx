import Link from "next/link";
import { notFound } from "next/navigation";

import { SetupNotice } from "@/app/admin/setup-notice";
import { actorSummaryText } from "@/components/actor-attribution";
import { ChatIcon, GearIcon, HeartIcon, InfoIcon } from "@/components/shell/icons";
import { PageHeader } from "@/components/shell/PageHeader";
import { currentAppUser } from "@/lib/auth";
import { listComments } from "@/lib/comments/service";
import { logHeading, weatherSummary } from "@/lib/daily-logs/display";
import { db } from "@/lib/db";
import { resolveFileUrlsSafe } from "@/lib/files/service";
import { formatDate } from "@/lib/format";
import { findOrgJobSummary } from "@/lib/jobs/request-job";

import { toggleDailyLogLikeAction } from "../actions";
import { LogPhotoGrid } from "../log-photo-grid";
import { PrintButton } from "../print-button";
import { LogCommentForm } from "./comment-form";

export const dynamic = "force-dynamic";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "")).toUpperCase() || "?";
}

/** One daily log opened: every photo and file, the notes, and its comment thread (Buildertrend's log detail). */
export default async function DailyLogDetailPage({ params }: PageProps<"/jobs/[jobId]/daily-logs/[logId]">) {
  const { jobId, logId } = await params;

  let user;
  try {
    user = await currentAppUser();
  } catch (error) {
    return <SetupNotice detail={error instanceof Error ? error.message : String(error)} />;
  }
  if (!user) {
    return <SetupNotice detail="No organization found. Seed the database, then reload." />;
  }

  const job = await findOrgJobSummary(user.organizationId, jobId);
  if (!job) notFound();

  const log = await db.dailyLog.findFirst({
    where: { id: logId, jobId: job.id },
    include: {
      authorUser: { select: { id: true, name: true, email: true } },
      authorApiKey: { select: { name: true, agentKind: true } },
      files: {
        where: { deletedAt: null },
        orderBy: { createdAt: "asc" },
        select: { id: true, fileName: true, category: true, url: true },
      },
      _count: { select: { likes: true } },
      likes: { where: { userId: user.id }, select: { userId: true } },
    },
  });
  if (!log) notFound();

  const [comments, signedUrls] = await Promise.all([
    listComments({ organizationId: user.organizationId, featureType: "DailyLog", featureId: log.id }),
    resolveFileUrlsSafe(log.files.map((file) => file.url)),
  ]);
  const files = log.files.map((file, index) => ({
    id: file.id,
    fileName: file.fileName,
    category: file.category,
    url: signedUrls[index] ?? null,
  }));
  const authorIds = [...new Set(comments.map((c) => c.authorUserId).filter((id): id is string => id !== null))];
  const apiKeyIds = [...new Set(comments.map((c) => c.authorApiKeyId).filter((id): id is string => id !== null))];
  const [authors, apiKeys] = await Promise.all([
    authorIds.length ? db.user.findMany({ where: { id: { in: authorIds } }, select: { id: true, name: true, email: true } }) : Promise.resolve([]),
    apiKeyIds.length
      ? db.apiKey.findMany({ where: { id: { in: apiKeyIds } }, select: { id: true, name: true, agentKind: true } })
      : Promise.resolve([]),
  ]);
  const authorName = new Map(authors.map((a) => [a.id, a.name ?? a.email]));
  const apiKeyById = new Map(apiKeys.map((key) => [key.id, key]));

  const weather = weatherSummary(log.weather);
  const liked = log.likes.length > 0;
  const author = actorSummaryText({ user: log.authorUser, apiKey: log.authorApiKey });

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-4 sm:p-6">
      <PageHeader
        jobName={job.name}
        title={logHeading(log.createdAt, log.title)}
        action={
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
              <span
                className="inline-flex h-8 w-8 items-center justify-center rounded-md border bg-white"
                style={{ borderColor: "var(--bt-border)", color: "var(--bt-chrome-info, #0ea5e9)" }}
                title="Info"
                aria-hidden
              >
                <InfoIcon className="h-4 w-4" />
              </span>
              <span
                className="inline-flex h-8 w-8 items-center justify-center rounded-md border bg-white"
                style={{ borderColor: "var(--bt-border)", color: "var(--bt-chrome-settings, #8b5cf6)" }}
                title="Settings"
                aria-hidden
              >
                <GearIcon className="h-4 w-4" />
              </span>
            </div>
            <PrintButton />
          </div>
        }
      />
      <Link href={`/jobs/${job.id}/daily-logs`} className="text-sm font-medium text-[var(--bt-primary)] hover:underline">
        ← All daily logs
      </Link>

      <section className="rounded-lg border bg-[var(--bt-panel-bg)] p-5" style={{ borderColor: "var(--bt-border)" }}>
        <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-[var(--bt-text)]">
          <span className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1" style={{ borderColor: "var(--bt-border)" }}>
            <span className="flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-semibold" style={{ background: "var(--bt-status-open-bg)", color: "var(--bt-status-open-text)" }}>
              {initials(author)}
            </span>
            {author}
          </span>
          {log.clientVisible ? <span className="rounded-full border px-2.5 py-1" style={{ borderColor: "var(--bt-border)" }}>Client</span> : null}
          {log.subVisible ? <span className="rounded-full border px-2.5 py-1" style={{ borderColor: "var(--bt-border)" }}>Subs</span> : null}
          <span className="rounded-full border px-2.5 py-1" style={{ borderColor: "var(--bt-border)" }}>Internal</span>
          {weather ? (
            <span className="ml-auto inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[var(--bt-muted)]" style={{ borderColor: "var(--bt-border)" }}>
              {weather.condition ? <span>{weather.condition}</span> : null}
              {weather.tempF !== null ? <span className="font-medium text-[var(--bt-text)]">{weather.tempF}°F</span> : null}
            </span>
          ) : null}
        </div>

        <LogPhotoGrid files={files} />

        <div className="mt-4 flex items-center gap-4 border-b pb-3 text-sm text-[var(--bt-muted)]" style={{ borderColor: "var(--bt-border)" }}>
          <form action={toggleDailyLogLikeAction}>
            <input type="hidden" name="jobId" value={job.id} />
            <input type="hidden" name="logId" value={log.id} />
            <button type="submit" aria-pressed={liked} className="inline-flex items-center gap-1.5 hover:text-[var(--bt-text)]" style={liked ? { color: "var(--bt-danger)" } : undefined}>
              <HeartIcon className="h-4 w-4" filled={liked} />
              {log._count.likes}
            </button>
          </form>
          <span className="inline-flex items-center gap-1.5">
            <ChatIcon className="h-4 w-4" /> {comments.length}
          </span>
        </div>

        <h2 className="mt-3 text-sm font-semibold text-[var(--bt-text)]">Notes</h2>
        <p className="mt-1 whitespace-pre-wrap text-sm text-[var(--bt-text)]">{log.note}</p>
      </section>

      <section className="rounded-lg border bg-[var(--bt-panel-bg)] p-5" style={{ borderColor: "var(--bt-border)" }}>
        <h2 className="mb-3 text-sm font-semibold text-[var(--bt-text)]">Comments ({comments.length})</h2>
        <div className="mb-4 flex flex-col gap-3">
          {comments.length === 0 ? (
            <div className="flex flex-col items-center gap-1.5 py-8 text-center">
              <ChatIcon className="h-9 w-9 text-[var(--bt-muted)]" />
              <p className="text-sm font-semibold text-[var(--bt-text)]">No comments yet</p>
              <p className="max-w-sm text-xs text-[var(--bt-muted)]">Internal discussion on this daily log.</p>
            </div>
          ) : null}
          {comments.map((comment) => (
            <div key={comment.id} className="rounded border px-3 py-2" style={{ borderColor: "var(--bt-border)" }}>
              <div className="flex items-center justify-between text-xs text-[var(--bt-muted)]">
                <span className="font-medium text-[var(--bt-text)]">
                  {actorSummaryText({
                    user: comment.authorUserId
                      ? { name: authorName.get(comment.authorUserId) ?? null, email: null }
                      : null,
                    apiKey: comment.authorApiKeyId ? apiKeyById.get(comment.authorApiKeyId) : null,
                  })}
                </span>
                <span>{formatDate(comment.createdAt)}</span>
              </div>
              <p className="mt-1 whitespace-pre-wrap text-sm text-[var(--bt-text)]">{comment.body}</p>
            </div>
          ))}
        </div>
        <LogCommentForm jobId={job.id} logId={log.id} />
      </section>
    </div>
  );
}
