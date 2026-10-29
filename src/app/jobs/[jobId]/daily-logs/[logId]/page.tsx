import Link from "next/link";
import { notFound } from "next/navigation";

import { SetupNotice } from "@/app/admin/setup-notice";
import { ChatIcon, DocumentIcon, HeartIcon, VideoIcon } from "@/components/shell/icons";
import { PageHeader } from "@/components/shell/PageHeader";
import { currentAppUser } from "@/lib/auth";
import { listComments } from "@/lib/comments/service";
import { logHeading, weatherSummary } from "@/lib/daily-logs/display";
import { db } from "@/lib/db";
import { resolveFileUrlsSafe } from "@/lib/files/service";
import { formatDate } from "@/lib/format";
import { findOrgJobSummary } from "@/lib/jobs/request-job";

import { toggleDailyLogLikeAction } from "../actions";
import { PrintButton } from "../print-button";
import { LogCommentForm } from "./comment-form";

export const dynamic = "force-dynamic";

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
  const authors = authorIds.length ? await db.user.findMany({ where: { id: { in: authorIds } }, select: { id: true, name: true, email: true } }) : [];
  const authorName = new Map(authors.map((a) => [a.id, a.name ?? a.email]));

  const weather = weatherSummary(log.weather);
  const liked = log.likes.length > 0;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 p-6">
      <PageHeader jobName={job.name} title={logHeading(log.createdAt, log.title)} action={<PrintButton />} />
      <Link href={`/jobs/${job.id}/daily-logs`} className="text-sm font-medium text-[var(--bt-primary)] hover:underline">
        ← All daily logs
      </Link>

      <section className="rounded-lg border bg-[var(--bt-panel-bg)] p-5" style={{ borderColor: "var(--bt-border)" }}>
        <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-[var(--bt-text)]">
          <span className="rounded-full border px-2.5 py-1" style={{ borderColor: "var(--bt-border)" }}>{log.authorUser.name ?? log.authorUser.email}</span>
          {log.clientVisible ? <span className="rounded-full border px-2.5 py-1" style={{ borderColor: "var(--bt-border)" }}>Client</span> : null}
          {log.subVisible ? <span className="rounded-full border px-2.5 py-1" style={{ borderColor: "var(--bt-border)" }}>Subs</span> : null}
          <span className="rounded-full border px-2.5 py-1" style={{ borderColor: "var(--bt-border)" }}>Internal</span>
          {weather ? (
            <span className="ml-auto text-[var(--bt-muted)]">
              {weather.condition ?? ""} {weather.tempF !== null ? `${weather.tempF}°F` : ""}
            </span>
          ) : null}
        </div>

        {files.length > 0 ? (
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {files.map((file) =>
              file.url ? (
                <a key={file.id} href={file.url} target="_blank" rel="noreferrer" className="block aspect-[4/3] overflow-hidden rounded bg-[var(--bt-page-bg)]" title={file.fileName}>
                  {file.category === "PHOTO" ? (
                    // eslint-disable-next-line @next/next/no-img-element -- signed URLs are short-lived and per-request, not suited to next/image's caching
                    <img src={file.url} alt={file.fileName} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-[var(--bt-muted)]">
                      {file.category === "VIDEO" ? <VideoIcon className="h-8 w-8" /> : <DocumentIcon className="h-8 w-8" />}
                      <span className="max-w-full truncate px-2 text-xs">{file.fileName}</span>
                    </div>
                  )}
                </a>
              ) : (
                <div key={file.id} className="flex aspect-[4/3] items-center justify-center rounded text-xs text-[var(--bt-muted)]" style={{ background: "var(--bt-panel-bg-muted)" }}>
                  {file.fileName} is unavailable
                </div>
              ),
            )}
          </div>
        ) : null}

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
          {comments.length === 0 ? <p className="text-sm text-[var(--bt-muted)]">No comments yet.</p> : null}
          {comments.map((comment) => (
            <div key={comment.id} className="rounded border px-3 py-2" style={{ borderColor: "var(--bt-border)" }}>
              <div className="flex items-center justify-between text-xs text-[var(--bt-muted)]">
                <span className="font-medium text-[var(--bt-text)]">{comment.authorUserId ? (authorName.get(comment.authorUserId) ?? "Unknown") : "Unknown"}</span>
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
