import Link from "next/link";
import { notFound } from "next/navigation";

import { SetupNotice } from "@/app/admin/setup-notice";
import { CreateModal } from "@/components/shell/CreateModal";
import { PageHeader } from "@/components/shell/PageHeader";
import { currentAppUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { isAnthropicConfigured } from "@/lib/env";
import { isJarvisUiEnabled } from "@/lib/feature-flags";
import { resolveFileUrlSafe } from "@/lib/files/service";

import { toggleDailyLogLikeAction } from "./actions";
import { DailyLogForm } from "./daily-log-form";
import { logHeading, weatherSummary } from "@/lib/daily-logs/display";

import { LogGallery } from "./log-gallery";
import { PrintButton } from "./print-button";

export const dynamic = "force-dynamic";

const PAGE_SIZES = [20, 50, 100] as const;

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "")).toUpperCase() || "?";
}

export default async function DailyLogsPage({ params, searchParams }: PageProps<"/jobs/[jobId]/daily-logs">) {
  const { jobId } = await params;
  const { q: qParam, from: fromParam, to: toParam, page: pageParam, size: sizeParam } = await searchParams;
  const q = typeof qParam === "string" ? qParam.trim() : "";
  const from = typeof fromParam === "string" && /^\d{4}-\d{2}-\d{2}$/.test(fromParam) ? fromParam : "";
  const to = typeof toParam === "string" && /^\d{4}-\d{2}-\d{2}$/.test(toParam) ? toParam : "";
  const size = PAGE_SIZES.find((n) => String(n) === sizeParam) ?? 20;
  const page = Math.max(1, Number.parseInt(typeof pageParam === "string" ? pageParam : "1", 10) || 1);

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

  const where = {
    jobId: job.id,
    ...(q ? { OR: [{ note: { contains: q, mode: "insensitive" as const } }, { title: { contains: q, mode: "insensitive" as const } }] } : {}),
    ...(from || to ? { createdAt: { ...(from ? { gte: new Date(`${from}T00:00:00Z`) } : {}), ...(to ? { lt: new Date(new Date(`${to}T00:00:00Z`).getTime() + 86_400_000) } : {}) } } : {}),
  };

  const [total, logs] = await Promise.all([
    db.dailyLog.count({ where }),
    db.dailyLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * size,
      take: size,
      include: { authorUser: true, files: { where: { deletedAt: null }, orderBy: { createdAt: "asc" } }, _count: { select: { likes: true } }, likes: { where: { userId: user.id }, select: { userId: true } } },
    }),
  ]);

  const commentCounts = logs.length
    ? await db.comment.groupBy({ by: ["featureId"], where: { organizationId: user.organizationId, featureType: "DailyLog", featureId: { in: logs.map((log) => log.id) } }, _count: { _all: true } })
    : [];
  const commentsByLog = new Map(commentCounts.map((row) => [row.featureId, row._count._all]));

  const cards = await Promise.all(
    logs.map(async (log) => ({
      log,
      files: await Promise.all(log.files.map(async (file) => ({ id: file.id, fileName: file.fileName, category: file.category, url: await resolveFileUrlSafe(file.url) }))),
    })),
  );

  const pageCount = Math.max(1, Math.ceil(total / size));
  const href = (next: { page?: number; size?: number }) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    params.set("page", String(next.page ?? page));
    if ((next.size ?? size) !== 20) params.set("size", String(next.size ?? size));
    return `/jobs/${job.id}/daily-logs?${params.toString()}`;
  };
  const filterCount = [q, from, to].filter(Boolean).length;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 p-6">
      <PageHeader
        jobName={job.name}
        title="Daily Logs"
        action={
          <div className="flex items-center gap-2">
            <PrintButton />
            <details className="relative">
              <summary className="cursor-pointer list-none rounded border px-3 py-2 text-sm font-medium text-[var(--bt-text)]" style={{ borderColor: "var(--bt-border)" }}>
                Filter{filterCount > 0 ? ` (${filterCount})` : ""}
              </summary>
              <form action={`/jobs/${job.id}/daily-logs`} className="absolute right-0 z-20 mt-1 flex w-72 flex-col gap-3 rounded-lg border bg-[var(--bt-panel-bg)] p-4 shadow-lg" style={{ borderColor: "var(--bt-border)" }}>
                <label className="flex flex-col gap-1 text-xs font-semibold text-[var(--bt-muted)]">
                  Search title and notes
                  <input name="q" defaultValue={q} className="rounded border px-2 py-1.5 text-sm font-normal" style={{ borderColor: "var(--bt-border)" }} />
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="flex flex-col gap-1 text-xs font-semibold text-[var(--bt-muted)]">
                    From
                    <input type="date" name="from" defaultValue={from} className="rounded border px-2 py-1.5 text-sm font-normal" style={{ borderColor: "var(--bt-border)" }} />
                  </label>
                  <label className="flex flex-col gap-1 text-xs font-semibold text-[var(--bt-muted)]">
                    To
                    <input type="date" name="to" defaultValue={to} className="rounded border px-2 py-1.5 text-sm font-normal" style={{ borderColor: "var(--bt-border)" }} />
                  </label>
                </div>
                <div className="flex items-center justify-between">
                  <Link href={`/jobs/${job.id}/daily-logs`} className="text-xs font-medium text-[var(--bt-muted)] hover:underline">
                    Clear
                  </Link>
                  <button type="submit" className="rounded px-3 py-1.5 text-sm font-semibold text-[var(--bt-on-primary)]" style={{ background: "var(--bt-primary)" }}>
                    Apply
                  </button>
                </div>
              </form>
            </details>
            <CreateModal triggerLabel="+ Daily Log" title="New daily log">
              <DailyLogForm jobId={job.id} aiEnabled={isAnthropicConfigured() && isJarvisUiEnabled()} />
            </CreateModal>
          </div>
        }
      />

      <div className="flex flex-col gap-4">
        {cards.length === 0 ? (
          <p className="rounded-lg border bg-[var(--bt-panel-bg)] px-4 py-10 text-center text-sm text-[var(--bt-muted)]" style={{ borderColor: "var(--bt-border)" }}>
            {filterCount > 0 ? "No daily logs match the filter." : "No daily logs yet. Use + Daily Log to add the first one."}
          </p>
        ) : (
          cards.map(({ log, files }) => {
            const weather = weatherSummary(log.weather);
            const author = log.authorUser.name ?? log.authorUser.email;
            const liked = log.likes.length > 0;
            const detailHref = `/jobs/${job.id}/daily-logs/${log.id}`;
            return (
              <article key={log.id} className="rounded-lg border bg-[var(--bt-panel-bg)] p-5" style={{ borderColor: "var(--bt-border)" }}>
                <div className="flex items-start justify-between gap-3">
                  <Link href={detailHref} className="text-lg font-semibold text-[var(--bt-primary)] underline-offset-2 hover:underline">
                    {logHeading(log.createdAt, log.title)}
                  </Link>
                </div>

                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
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
                  </div>
                  {files.length > 0 ? (
                    <Link href={detailHref} className="rounded border px-3 py-1.5 text-sm font-medium text-[var(--bt-text)]" style={{ borderColor: "var(--bt-border)" }}>
                      View all ({files.length})
                    </Link>
                  ) : null}
                </div>

                <div className="mt-3">
                  <LogGallery files={files} href={detailHref} />
                </div>

                <div className="mt-3 flex items-center justify-between gap-3 border-b pb-3 text-sm text-[var(--bt-muted)]" style={{ borderColor: "var(--bt-border)" }}>
                  <div className="flex items-center gap-4">
                    <form action={toggleDailyLogLikeAction}>
                      <input type="hidden" name="jobId" value={job.id} />
                      <input type="hidden" name="logId" value={log.id} />
                      <button type="submit" aria-pressed={liked} className="inline-flex items-center gap-1.5 hover:text-[var(--bt-text)]" style={liked ? { color: "var(--bt-danger)" } : undefined}>
                        <span aria-hidden>{liked ? "♥" : "♡"}</span>
                        {log._count.likes}
                      </button>
                    </form>
                    <Link href={detailHref} className="inline-flex items-center gap-1.5 hover:text-[var(--bt-text)]">
                      <span aria-hidden>💬</span>
                      {commentsByLog.get(log.id) ?? 0}
                    </Link>
                  </div>
                  {weather ? (
                    <span className="inline-flex items-center gap-1.5">
                      {weather.condition ? <span>{weather.condition}</span> : null}
                      {weather.tempF !== null ? <span className="font-medium text-[var(--bt-text)]">{weather.tempF}°F</span> : null}
                    </span>
                  ) : null}
                </div>

                <h3 className="mt-3 text-sm font-semibold text-[var(--bt-text)]">Notes</h3>
                <p className="mt-1 whitespace-pre-wrap text-sm text-[var(--bt-text)]">{log.note}</p>
              </article>
            );
          })
        )}
      </div>

      <div className="flex items-center justify-end gap-3 text-sm text-[var(--bt-muted)]">
        <span>
          {total === 0 ? "0 items" : `${(page - 1) * size + 1}-${Math.min(total, page * size)} of ${total} items`}
        </span>
        {page > 1 ? (
          <Link href={href({ page: page - 1 })} className="rounded border px-2.5 py-1" style={{ borderColor: "var(--bt-border)" }}>
            Prev
          </Link>
        ) : null}
        {page < pageCount ? (
          <Link href={href({ page: page + 1 })} className="rounded border px-2.5 py-1" style={{ borderColor: "var(--bt-border)" }}>
            Next
          </Link>
        ) : null}
        <span className="flex items-center gap-1">
          {PAGE_SIZES.map((n) => (
            <Link key={n} href={href({ page: 1, size: n })} className="rounded px-1.5 py-0.5" style={n === size ? { background: "var(--bt-panel-bg-muted)", color: "var(--bt-text)", fontWeight: 600 } : undefined}>
              {n}
            </Link>
          ))}
          / page
        </span>
      </div>
    </div>
  );
}
