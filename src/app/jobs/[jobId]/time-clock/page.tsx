import { notFound } from "next/navigation";

import { SetupNotice } from "@/app/admin/setup-notice";
import { EmptyState } from "@/components/shell/EmptyState";
import { currentAppUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { workedHours } from "@/lib/time-clock/hours";

import { reviewTimeClockEntryAction } from "./actions";

export const dynamic = "force-dynamic";

const STATUS_STYLE: Record<string, { bg: string; text: string }> = {
  PENDING: { bg: "color-mix(in srgb, var(--bt-hazard) 14%, transparent)", text: "var(--bt-hazard)" },
  APPROVED: { bg: "var(--bt-status-open-bg)", text: "var(--bt-status-open-text)" },
  REJECTED: { bg: "color-mix(in srgb, var(--bt-danger) 14%, transparent)", text: "var(--bt-danger)" },
};

function formatHours(hours: number): string {
  return `${hours.toFixed(2)} hrs`;
}

export default async function TimeClockPage({ params }: PageProps<"/jobs/[jobId]/time-clock">) {
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

  const entries = await db.timeClockEntry.findMany({
    where: { jobId: job.id },
    orderBy: { clockInAt: "desc" },
    take: 100,
    include: { user: true, costCode: true, breaks: true },
  });

  const canReview = user.role === "ADMIN" || user.role === "PM";

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 p-6">
      <h1 className="text-xl font-semibold text-[var(--bt-text)]">Time clock — {job.name}</h1>

      {entries.length === 0 ? (
        <EmptyState title="No time clock entries yet" description="Clock-ins from the field app for this job will appear here." />
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-[var(--bt-panel-bg)]" style={{ borderColor: "var(--bt-border)" }}>
          <table className="w-full min-w-max text-left text-sm">
            <thead>
              <tr className="border-b text-xs font-semibold uppercase tracking-wide text-[var(--bt-muted)]" style={{ borderColor: "var(--bt-border)" }}>
                <th className="px-4 py-3">Worker</th>
                <th className="px-4 py-3">Cost code</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Hours</th>
                <th className="px-4 py-3">Status</th>
                {canReview ? <th className="px-4 py-3">Review</th> : null}
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => {
                const style = STATUS_STYLE[entry.approvalStatus] ?? STATUS_STYLE.PENDING;
                const hours = workedHours(entry.clockInAt, entry.clockOutAt, entry.breaks);
                return (
                  <tr key={entry.id} className="border-b last:border-0" style={{ borderColor: "var(--bt-border)" }}>
                    <td className="px-4 py-3 text-[var(--bt-text)]">{entry.user.email}</td>
                    <td className="px-4 py-3 text-[var(--bt-muted)]">{entry.costCode.name}</td>
                    <td className="px-4 py-3 text-[var(--bt-muted)]">{formatDate(entry.clockInAt)}</td>
                    <td className="px-4 py-3 text-[var(--bt-text)]">{entry.clockOutAt ? formatHours(hours) : "In progress"}</td>
                    <td className="px-4 py-3">
                      <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: style.bg, color: style.text }}>
                        {entry.approvalStatus}
                      </span>
                    </td>
                    {canReview ? (
                      <td className="px-4 py-3">
                        {entry.approvalStatus === "PENDING" && entry.clockOutAt ? (
                          <div className="flex gap-2">
                            <form action={reviewTimeClockEntryAction}>
                              <input type="hidden" name="jobId" value={job.id} />
                              <input type="hidden" name="entryId" value={entry.id} />
                              <input type="hidden" name="decision" value="approve" />
                              <button type="submit" className="rounded px-2 py-1 text-xs font-semibold text-[var(--bt-on-primary)]" style={{ background: "var(--bt-primary)" }}>
                                Approve
                              </button>
                            </form>
                            <form action={reviewTimeClockEntryAction}>
                              <input type="hidden" name="jobId" value={job.id} />
                              <input type="hidden" name="entryId" value={entry.id} />
                              <input type="hidden" name="decision" value="reject" />
                              <button type="submit" className="rounded border px-2 py-1 text-xs font-semibold text-[var(--bt-muted)]" style={{ borderColor: "var(--bt-border)" }}>
                                Reject
                              </button>
                            </form>
                          </div>
                        ) : null}
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
