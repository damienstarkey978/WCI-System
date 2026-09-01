import { notFound } from "next/navigation";

import { SetupNotice } from "@/app/admin/setup-notice";
import { EmptyState } from "@/components/shell/EmptyState";
import { currentAppUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/format";

import { AnswerRfiForm } from "./answer-rfi-form";
import { closeRfiAction } from "./actions";
import { CreateRfiForm } from "./create-rfi-form";

export const dynamic = "force-dynamic";

const STATUS_STYLE: Record<string, { bg: string; text: string }> = {
  OPEN: { bg: "color-mix(in srgb, var(--bt-hazard) 14%, transparent)", text: "var(--bt-hazard)" },
  ANSWERED: { bg: "color-mix(in srgb, var(--bt-primary) 14%, transparent)", text: "var(--bt-primary)" },
  CLOSED: { bg: "#e5e7eb", text: "#374151" },
};

export default async function RfisPage({ params }: PageProps<"/jobs/[jobId]/rfis">) {
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

  const [rfis, users] = await Promise.all([
    db.rfi.findMany({
      where: { jobId: job.id },
      orderBy: { createdAt: "desc" },
      include: { assigneeUser: true },
    }),
    db.user.findMany({ where: { organizationId: user.organizationId, isActive: true }, orderBy: { email: "asc" }, select: { id: true, email: true } }),
  ]);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4 p-6">
      <h1 className="text-xl font-semibold text-[var(--bt-text)]">RFIs — {job.name}</h1>

      <CreateRfiForm jobId={job.id} users={users} />

      {rfis.length === 0 ? (
        <EmptyState title="No RFIs yet" description="Requests for information created for this job will appear here." />
      ) : (
        <div className="flex flex-col gap-3">
          {rfis.map((rfi) => {
            const style = STATUS_STYLE[rfi.status] ?? STATUS_STYLE.OPEN;
            return (
              <article key={rfi.id} className="rounded-lg border bg-[var(--bt-panel-bg)] p-4" style={{ borderColor: "var(--bt-border)" }}>
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold text-[var(--bt-text)]">{rfi.title}</h2>
                  <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: style.bg, color: style.text }}>
                    {rfi.status}
                  </span>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm text-[var(--bt-text)]">{rfi.question}</p>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--bt-muted)]">
                  <span>Asked {formatDate(rfi.createdAt)}</span>
                  {rfi.dueDate ? <span>Due {formatDate(rfi.dueDate)}</span> : null}
                  {rfi.assigneeUser ? <span>Assigned to {rfi.assigneeUser.email}</span> : null}
                </div>
                {rfi.answer ? (
                  <div className="mt-2 rounded bg-[var(--bt-page-bg)] p-2 text-sm text-[var(--bt-text)]">
                    <span className="text-xs font-semibold text-[var(--bt-muted)]">Answer: </span>
                    {rfi.answer}
                  </div>
                ) : null}
                {rfi.status !== "CLOSED" ? (
                  <div className="mt-2 flex items-center gap-3">
                    {rfi.status === "OPEN" ? <AnswerRfiForm jobId={job.id} rfiId={rfi.id} /> : null}
                    <form action={closeRfiAction}>
                      <input type="hidden" name="jobId" value={job.id} />
                      <input type="hidden" name="rfiId" value={rfi.id} />
                      <button type="submit" className="text-xs text-[var(--bt-muted)] hover:text-red-600 hover:underline">
                        Close
                      </button>
                    </form>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
