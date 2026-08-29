import { notFound } from "next/navigation";

import { SetupNotice } from "@/app/admin/setup-notice";
import { EmptyState } from "@/components/shell/EmptyState";
import { JarvisChatPanel } from "@/components/jarvis/JarvisChatPanel";
import { currentAppUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { extendedCostCents, priceWithRate } from "@/lib/budget/funnel";
import { isAnthropicConfigured } from "@/lib/env";
import { listEstimateTemplates } from "@/lib/estimates/templates";
import { formatDate, formatMoney } from "@/lib/format";
import { listMaterialCatalogItems } from "@/lib/materials/service";

import { CreateEstimateForm } from "./create-estimate-form";
import { CsvImportForm } from "./csv-import-form";
import { SaveAsTemplateForm } from "./save-as-template-form";
import { UseTemplateForm } from "./use-template-form";

export const dynamic = "force-dynamic";

const STATUS_STYLE: Record<string, { bg: string; text: string }> = {
  DRAFT: { bg: "#e5e7eb", text: "#374151" },
  SENT: { bg: "#dbeafe", text: "#1e40af" },
  ACCEPTED: { bg: "var(--bt-status-open-bg)", text: "var(--bt-status-open-text)" },
  DECLINED: { bg: "#fee2e2", text: "#991b1b" },
};

export default async function EstimatesPage({ params }: PageProps<"/jobs/[jobId]/estimates">) {
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

  const [estimates, costCodes, materials, templates] = await Promise.all([
    db.estimate.findMany({
      where: { jobId: job.id },
      orderBy: { createdAt: "desc" },
      include: { lineItems: true },
    }),
    db.costCode.findMany({
      where: { organizationId: user.organizationId, isActive: true },
      orderBy: { sortOrder: "asc" },
      select: { id: true, code: true, name: true },
    }),
    listMaterialCatalogItems(user.organizationId),
    listEstimateTemplates(user.organizationId),
  ]);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 p-6">
      <h1 className="text-xl font-semibold text-[var(--bt-text)]">Estimates — {job.name}</h1>

      {isAnthropicConfigured() ? (
        <JarvisChatPanel
          context={{ page: "job_detail", jobId: job.id, jobName: job.name, section: "estimates" }}
          storageKey={`job-estimates:${job.id}`}
          emptyStateHint="Describe the scope of work — measurements, materials, anything relevant — and Jarvis drafts a full cost-coded estimate against this job's catalog. Attach photos and it'll factor those in too."
          heightClassName="h-96"
        />
      ) : null}

      <CreateEstimateForm jobId={job.id} costCodes={costCodes} materials={materials} />

      <UseTemplateForm jobId={job.id} templates={templates.map((t) => ({ id: t.id, name: t.name, lineItemCount: t.lineItems.length }))} />

      <CsvImportForm jobId={job.id} />

      {estimates.length === 0 ? (
        <EmptyState title="No estimates yet" description="Estimates created for this job will appear here." />
      ) : (
        <div className="overflow-hidden rounded-lg border bg-white" style={{ borderColor: "var(--bt-border)" }}>
          <table className="w-full text-left text-sm">
            <thead>
              <tr
                className="border-b text-xs font-semibold uppercase tracking-wide text-[var(--bt-muted)]"
                style={{ borderColor: "var(--bt-border)" }}
              >
                <th className="px-4 py-3">Title</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3 text-right">Client price</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {estimates.map((estimate) => {
                const style = STATUS_STYLE[estimate.status] ?? STATUS_STYLE.DRAFT;
                const clientPriceCents = estimate.lineItems.reduce((total, item) => {
                  const cost = extendedCostCents(item.quantityMilli, item.unitCostCents);
                  return total + priceWithRate(cost, item.rateMode, item.rateBasisPoints);
                }, 0);
                return (
                  <tr key={estimate.id} className="border-b last:border-0" style={{ borderColor: "var(--bt-border)" }}>
                    <td className="px-4 py-3 font-medium text-[var(--bt-text)]">{estimate.title}</td>
                    <td className="px-4 py-3">
                      <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: style.bg, color: style.text }}>
                        {estimate.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[var(--bt-muted)]">{formatDate(estimate.createdAt)}</td>
                    <td className="px-4 py-3 text-right text-[var(--bt-text)]">{formatMoney(clientPriceCents)}</td>
                    <td className="px-4 py-3">
                      <SaveAsTemplateForm jobId={job.id} estimateId={estimate.id} />
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
