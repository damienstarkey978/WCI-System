import Link from "next/link";
import { notFound } from "next/navigation";

import { SetupNotice } from "@/app/admin/setup-notice";
import { CreateModal } from "@/components/shell/CreateModal";
import { EmptyState } from "@/components/shell/EmptyState";
import { NoteIcon } from "@/components/shell/icons";
import { PageHeader } from "@/components/shell/PageHeader";
import { currentAppUser } from "@/lib/auth";
import { extendedCostCents } from "@/lib/budget/funnel";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/format";
import { listTakeoffsForJob } from "@/lib/takeoffs/service";

import { AiDraftTakeoffForm } from "./ai-draft-form";

export const dynamic = "force-dynamic";

export default async function TakeoffsPage({ params }: PageProps<"/jobs/[jobId]/takeoffs">) {
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

  const takeoffs = await listTakeoffsForJob(user.organizationId, job.id);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 p-4 sm:p-6">
      <PageHeader
        jobName={job.name}
        title="Takeoffs"
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/jobs/${job.id}/purchasing`}
              className="rounded border px-3 py-2 text-sm font-semibold"
              style={{ borderColor: "var(--bt-border)", color: "var(--bt-text)" }}
            >
              Purchasing
            </Link>
            <CreateModal triggerLabel="AI takeoff" title="Draft takeoff from plans / measurements">
              <AiDraftTakeoffForm jobId={job.id} />
            </CreateModal>
          </div>
        }
      />

      <p className="text-sm text-[var(--bt-muted)]">
        Quantity takeoffs from plans and measurements. Review, then explicitly send lines to Estimating or push to a PO.
      </p>

      {takeoffs.length === 0 ? (
        <EmptyState
          icon={<NoteIcon className="h-10 w-10" />}
          title="No takeoffs yet"
          description="Draft one from plan or measurement notes. Nothing is purchased until you Send to Estimating or Push to PO."
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border" style={{ borderColor: "var(--bt-border)" }}>
          <table className="min-w-full text-left text-sm">
            <thead className="bg-[var(--bt-panel-bg)] text-xs uppercase tracking-wide text-[var(--bt-muted)]">
              <tr>
                <th className="px-3 py-2 font-medium">Title</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Lines</th>
                <th className="px-3 py-2 font-medium">Est. cost</th>
                <th className="px-3 py-2 font-medium">Source</th>
              </tr>
            </thead>
            <tbody>
              {takeoffs.map((takeoff) => {
                const estCents = takeoff.lines.reduce(
                  (total, line) => total + extendedCostCents(line.quantityMilli, line.unitCostCents),
                  0,
                );
                return (
                  <tr key={takeoff.id} className="border-t" style={{ borderColor: "var(--bt-border)" }}>
                    <td className="px-3 py-2.5">
                      <Link
                        href={`/jobs/${job.id}/takeoffs/${takeoff.id}`}
                        className="font-medium text-[var(--bt-primary)] hover:underline"
                      >
                        {takeoff.title}
                      </Link>
                    </td>
                    <td className="px-3 py-2.5 text-[var(--bt-text)]">{takeoff.status}</td>
                    <td className="px-3 py-2.5 text-[var(--bt-text)]">{takeoff.lines.length}</td>
                    <td className="px-3 py-2.5 text-[var(--bt-text)]">{formatMoney(estCents)}</td>
                    <td className="px-3 py-2.5 text-[var(--bt-muted)]">
                      {takeoff.aiGenerated ? "AI draft" : "Manual"}
                    </td>
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
