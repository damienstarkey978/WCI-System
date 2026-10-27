import Link from "next/link";
import { notFound } from "next/navigation";

import { SetupNotice } from "@/app/admin/setup-notice";
import { PageHeader } from "@/components/shell/PageHeader";
import { currentAppUser } from "@/lib/auth";
import { extendedCostCents } from "@/lib/budget/funnel";
import { formatMoney } from "@/lib/format";
import { getTakeoff, TakeoffNotFoundError } from "@/lib/takeoffs/service";

import { TakeoffActionsPanel } from "../takeoff-actions-panel";

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
              href={`/jobs/${jobId}/purchasing`}
              className="rounded border px-3 py-2 text-sm font-semibold"
              style={{ borderColor: "var(--bt-border)" }}
            >
              Purchasing
            </Link>
          </div>
        }
      />

      <div className="flex flex-wrap gap-3 text-sm text-[var(--bt-muted)]">
        <span>Status: {takeoff.status}</span>
        <span>{takeoff.aiGenerated ? "AI draft" : "Manual"}</span>
        <span>{takeoff.lines.length} lines</span>
      </div>

      {takeoff.notes ? (
        <div
          className="rounded-lg border p-3 text-sm whitespace-pre-wrap text-[var(--bt-text)]"
          style={{ borderColor: "var(--bt-border)", background: "var(--bt-panel-bg)" }}
        >
          <div className="mb-1 text-xs font-medium uppercase tracking-wide text-[var(--bt-muted)]">
            Source notes
          </div>
          {takeoff.notes}
        </div>
      ) : null}

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
            {takeoff.lines.map((line) => (
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
            ))}
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
