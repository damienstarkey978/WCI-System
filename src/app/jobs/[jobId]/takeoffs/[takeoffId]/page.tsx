import Link from "next/link";
import { notFound } from "next/navigation";

import { SetupNotice } from "@/app/admin/setup-notice";
import { CreateModal } from "@/components/shell/CreateModal";
import { PageHeader } from "@/components/shell/PageHeader";
import { currentAppUser } from "@/lib/auth";
import { extendedCostCents } from "@/lib/budget/funnel";
import { resolveFileUrlSafe } from "@/lib/files/service";
import { formatDate, formatMoney } from "@/lib/format";
import {
  getTakeoff,
  listAvailablePlanFilesForTakeoff,
  TakeoffNotFoundError,
} from "@/lib/takeoffs/service";

import { AiDraftTakeoffForm } from "../ai-draft-form";
import { TakeoffActionsPanel } from "../takeoff-actions-panel";
import { TakeoffMeasurementsForm } from "../takeoff-measurements-form";
import { TakeoffPlansPanel } from "../takeoff-plans-panel";

export const dynamic = "force-dynamic";

export default async function TakeoffDetailPage({
  params,
}: PageProps<"/jobs/[jobId]/takeoffs/[takeoffId]">) {
  const { jobId, takeoffId } = await params;

  let user;
  try {
    user = await currentAppUser();
  } catch (error) {
    return <SetupNotice detail={error instanceof Error ? error.message : String(error)} />;
  }
  if (!user) {
    return <SetupNotice detail="No organization found. Seed the database, then reload." />;
  }

  let takeoff;
  try {
    takeoff = await getTakeoff(user.organizationId, takeoffId);
  } catch (error) {
    if (error instanceof TakeoffNotFoundError) notFound();
    throw error;
  }
  if (takeoff.jobId !== jobId) notFound();

  const availablePlanRows = await listAvailablePlanFilesForTakeoff(user.organizationId, takeoff.id);
  const availablePlans = availablePlanRows.map((file) => ({
    id: file.id,
    fileName: file.fileName,
    sizeBytes: file.sizeBytes,
    uploadedAt: formatDate(file.createdAt),
  }));

  const attachedPlans = (
    await Promise.all(
      takeoff.planFiles
        .filter((link) => link.file.deletedAt == null)
        .map(async (link) => ({
          id: link.file.id,
          fileName: link.file.fileName,
          url: await resolveFileUrlSafe(link.file.url),
          mimeType: link.file.mimeType,
          sizeBytes: link.file.sizeBytes,
          uploadedAt: formatDate(link.file.createdAt),
        })),
    )
  );

  const queueableLineIds = takeoff.lines
    .filter((line) => line.status === "DRAFT" || line.status === "READY")
    .map((line) => line.id);
  const pushableLineIds = takeoff.lines
    .filter((line) => line.status === "DRAFT" || line.status === "READY" || line.status === "QUEUED")
    .map((line) => line.id);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 p-4 sm:p-6">
      <PageHeader
        jobName={takeoff.job.name}
        title={takeoff.title}
        action={
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/jobs/${jobId}/takeoffs`}
              className="rounded border px-3 py-2 text-sm font-semibold"
              style={{ borderColor: "var(--bt-border)" }}
            >
              All takeoffs
            </Link>
            <Link
              href={`/jobs/${jobId}/plans-and-specs`}
              className="rounded border px-3 py-2 text-sm font-semibold"
              style={{ borderColor: "var(--bt-border)" }}
            >
              Plans &amp; Specs
            </Link>
            <Link
              href={`/jobs/${jobId}/purchasing`}
              className="rounded border px-3 py-2 text-sm font-semibold"
              style={{ borderColor: "var(--bt-border)" }}
            >
              Purchasing
            </Link>
            {takeoff.lines.length === 0 ? (
              <CreateModal triggerLabel="AI draft from notes" title="Draft takeoff lines from measurements">
                <AiDraftTakeoffForm
                  jobId={jobId}
                  takeoffId={takeoff.id}
                  defaultNotes={takeoff.notes}
                />
              </CreateModal>
            ) : null}
          </div>
        }
      />

      <div className="flex flex-wrap gap-3 text-sm text-[var(--bt-muted)]">
        <span>Status: {takeoff.status}</span>
        <span>{takeoff.aiGenerated ? "AI draft" : "Manual"}</span>
        <span>{takeoff.lines.length} lines</span>
        <span>
          {attachedPlans.length} plan{attachedPlans.length === 1 ? "" : "s"}
        </span>
      </div>

      <TakeoffPlansPanel
        jobId={jobId}
        takeoffId={takeoff.id}
        attachedPlans={attachedPlans}
        availablePlans={availablePlans}
      />

      <TakeoffMeasurementsForm jobId={jobId} takeoffId={takeoff.id} notes={takeoff.notes} />

      {takeoff.assumptions.length > 0 ? (
        <div className="rounded-lg border p-3 text-sm" style={{ borderColor: "var(--bt-border)" }}>
          <div className="mb-1 text-xs font-medium uppercase tracking-wide text-[var(--bt-muted)]">
            Assumptions
          </div>
          <ul className="list-disc space-y-1 pl-5 text-[var(--bt-text)]">
            {takeoff.assumptions.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-lg border" style={{ borderColor: "var(--bt-border)" }}>
        <table className="min-w-full text-left text-sm">
          <thead className="bg-[var(--bt-panel-bg)] text-xs uppercase tracking-wide text-[var(--bt-muted)]">
            <tr>
              <th className="px-3 py-2 font-medium">Line</th>
              <th className="px-3 py-2 font-medium">Cost code</th>
              <th className="px-3 py-2 font-medium">Qty</th>
              <th className="px-3 py-2 font-medium">Est.</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">PO</th>
            </tr>
          </thead>
          <tbody>
            {takeoff.lines.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-sm text-[var(--bt-muted)]">
                  No quantity lines yet. Attach plans, enter measurements above, then use AI draft — or add
                  lines once Estimating reviews.
                </td>
              </tr>
            ) : (
              takeoff.lines.map((line) => (
                <tr key={line.id} className="border-t align-top" style={{ borderColor: "var(--bt-border)" }}>
                  <td className="px-3 py-2.5">
                    <div className="font-medium text-[var(--bt-text)]">{line.title}</div>
                    {line.description ? (
                      <div className="mt-0.5 text-xs text-[var(--bt-muted)]">{line.description}</div>
                    ) : null}
                    {line.groupLabel ? (
                      <div className="mt-0.5 text-xs text-[var(--bt-muted)]">{line.groupLabel}</div>
                    ) : null}
                  </td>
                  <td className="px-3 py-2.5 text-[var(--bt-text)]">
                    {line.costCode.code}
                    <div className="text-xs text-[var(--bt-muted)]">{line.costCode.name}</div>
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap text-[var(--bt-text)]">
                    {(line.quantityMilli / 1_000).toLocaleString()}
                    {line.unit ? ` ${line.unit}` : ""}
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap text-[var(--bt-text)]">
                    {formatMoney(extendedCostCents(line.quantityMilli, line.unitCostCents))}
                  </td>
                  <td className="px-3 py-2.5 text-[var(--bt-text)]">
                    {line.status}
                    {line.purchasingIntent ? (
                      <div className="text-xs text-[var(--bt-muted)]">Intent {line.purchasingIntent.status}</div>
                    ) : null}
                  </td>
                  <td className="px-3 py-2.5">
                    {line.purchaseOrder ? (
                      <Link
                        href={`/jobs/${jobId}/purchase-orders/${line.purchaseOrder.id}`}
                        className="text-[var(--bt-primary)] hover:underline"
                      >
                        {line.purchaseOrder.poNumber}
                      </Link>
                    ) : (
                      <span className="text-[var(--bt-muted)]">—</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <TakeoffActionsPanel
        jobId={jobId}
        takeoffId={takeoff.id}
        queueableLineIds={queueableLineIds}
        pushableLineIds={pushableLineIds}
      />
    </div>
  );
}
