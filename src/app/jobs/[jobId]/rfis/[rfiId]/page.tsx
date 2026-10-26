import Link from "next/link";
import { notFound } from "next/navigation";

import { SetupNotice } from "@/app/admin/setup-notice";
import { PageHeader } from "@/components/shell/PageHeader";
import { currentAppUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate, formatDateUtc } from "@/lib/format";

import { AnswerRfiForm } from "../answer-rfi-form";
import { closeRfiAction } from "../actions";
import { RfiDetailForm } from "./detail-form";

export const dynamic = "force-dynamic";

const STATUS_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  OPEN: { bg: "color-mix(in srgb, var(--bt-hazard) 14%, transparent)", text: "var(--bt-hazard)", label: "Open" },
  ANSWERED: { bg: "color-mix(in srgb, var(--bt-primary) 14%, transparent)", text: "var(--bt-primary)", label: "Answered" },
  CLOSED: { bg: "#e5e7eb", text: "#374151", label: "Closed" },
};

export default async function RfiDetailPage({ params }: PageProps<"/jobs/[jobId]/rfis/[rfiId]">) {
  const { jobId, rfiId } = await params;

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

  const [rfi, users] = await Promise.all([
    db.rfi.findFirst({
      where: { id: rfiId, jobId: job.id, organizationId: user.organizationId },
      include: { assigneeUser: { select: { email: true, name: true } } },
    }),
    db.user.findMany({
      where: { organizationId: user.organizationId, isActive: true },
      orderBy: { email: "asc" },
      select: { id: true, email: true, name: true },
    }),
  ]);
  if (!rfi) notFound();

  const badge = STATUS_STYLE[rfi.status] ?? STATUS_STYLE.OPEN;
  const editable = rfi.status !== "CLOSED";
  const rfiNumber = String(rfi.number).padStart(4, "0");

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href={`/jobs/${job.id}/rfis`} className="text-xs font-medium text-[var(--bt-primary)] hover:underline">
            ← RFIs
          </Link>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <PageHeader jobName={job.name} title="RFI" />
            <span className="rounded-full px-2 py-0.5 text-xs font-semibold" style={{ background: badge.bg, color: badge.text }}>
              {badge.label}
            </span>
          </div>
          <p className="mt-1 text-sm text-[var(--bt-muted)]">
            #{rfiNumber}
            {rfi.dueDate ? ` · Due ${formatDateUtc(rfi.dueDate)}` : ""}
            {rfi.answeredAt ? ` · Answered ${formatDate(rfi.answeredAt)}` : ""}
          </p>
        </div>
        {editable ? (
          <form action={closeRfiAction}>
            <input type="hidden" name="jobId" value={job.id} />
            <input type="hidden" name="rfiId" value={rfi.id} />
            <button type="submit" className="rounded border px-3 py-2 text-sm font-semibold" style={{ borderColor: "var(--bt-border)" }}>
              Close
            </button>
          </form>
        ) : null}
      </div>

      <RfiDetailForm
        jobId={job.id}
        rfiId={rfi.id}
        rfiNumber={rfiNumber}
        editable={editable}
        users={users}
        initial={{
          title: rfi.title,
          question: rfi.question,
          dueDate: rfi.dueDate ? rfi.dueDate.toISOString().slice(0, 10) : "",
          assigneeUserId: rfi.assigneeUserId ?? "",
          reminder: rfi.reminder ?? "None",
          relatedItemRef: rfi.relatedItemRef ?? "",
        }}
      />

      {rfi.answer ? (
        <div className="rounded-lg border bg-[var(--bt-panel-bg)] p-4" style={{ borderColor: "var(--bt-border)" }}>
          <h2 className="text-sm font-semibold text-[var(--bt-text)]">Answer</h2>
          <p className="mt-2 whitespace-pre-wrap text-sm text-[var(--bt-text)]">{rfi.answer}</p>
        </div>
      ) : rfi.status === "OPEN" ? (
        <div className="rounded-lg border bg-[var(--bt-panel-bg)] p-4" style={{ borderColor: "var(--bt-border)" }}>
          <h2 className="mb-2 text-sm font-semibold text-[var(--bt-text)]">Answer</h2>
          <AnswerRfiForm jobId={job.id} rfiId={rfi.id} />
        </div>
      ) : null}
    </div>
  );
}
