import { notFound } from "next/navigation";

import { SetupNotice } from "@/app/admin/setup-notice";
import { currentAppUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/format";

import { DailyLogForm } from "./daily-log-form";

export const dynamic = "force-dynamic";

function weatherSummary(weather: unknown): string | null {
  if (!weather || typeof weather !== "object") return null;
  const w = weather as Record<string, unknown>;
  const temp = typeof w.temperatureF === "number" ? `${Math.round(w.temperatureF)}°F` : null;
  const condition = typeof w.condition === "string" ? w.condition : null;
  return [condition, temp].filter(Boolean).join(", ") || null;
}

export default async function DailyLogsPage({ params }: PageProps<"/jobs/[jobId]/daily-logs">) {
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

  const logs = await db.dailyLog.findMany({
    where: { jobId: job.id },
    orderBy: { createdAt: "desc" },
    include: { authorUser: true },
  });

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4 p-6">
      <h1 className="text-xl font-semibold text-[var(--bt-text)]">Daily logs — {job.name}</h1>

      <DailyLogForm jobId={job.id} />

      <div className="flex flex-col gap-3">
        {logs.length === 0 ? (
          <p className="rounded-lg border bg-white px-4 py-6 text-center text-sm text-[var(--bt-muted)]" style={{ borderColor: "var(--bt-border)" }}>
            No daily logs yet — add the first one above.
          </p>
        ) : (
          logs.map((log) => {
            const weather = weatherSummary(log.weather);
            return (
              <article key={log.id} className="rounded-lg border bg-white p-4" style={{ borderColor: "var(--bt-border)" }}>
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--bt-muted)]">
                  <span className="font-medium text-[var(--bt-text)]">{formatDate(log.createdAt)}</span>
                  <div className="flex items-center gap-2">
                    {weather ? <span>{weather}</span> : null}
                    <span>{log.authorUser.email}</span>
                  </div>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm text-[var(--bt-text)]">{log.note}</p>
                <div className="mt-2 flex gap-2 text-[10px] font-semibold uppercase tracking-wide">
                  {log.clientVisible ? (
                    <span className="rounded px-1.5 py-0.5" style={{ background: "var(--bt-status-open-bg)", color: "var(--bt-status-open-text)" }}>
                      Client visible
                    </span>
                  ) : null}
                  {log.subVisible ? (
                    <span className="rounded bg-black/5 px-1.5 py-0.5 text-[var(--bt-muted)]">Sub visible</span>
                  ) : null}
                </div>
              </article>
            );
          })
        )}
      </div>
    </div>
  );
}
