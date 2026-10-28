import Link from "next/link";
import { notFound } from "next/navigation";

import { SetupNotice } from "@/app/admin/setup-notice";
import { CreateModal } from "@/components/shell/CreateModal";
import { EmptyState } from "@/components/shell/EmptyState";
import { ChartIcon } from "@/components/shell/icons";
import { currentAppUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { extendedCostCents, priceWithRate } from "@/lib/budget/funnel";
import { listEstimateTemplates } from "@/lib/estimates/templates";
import { listMaterialCatalogItems } from "@/lib/materials/service";

import { CreateEstimateForm } from "./create-estimate-form";
import { EstimatesGrid } from "./estimates-grid";
import { FinancialPageHeader } from "../financial-tabs";
import { CsvImportForm } from "./csv-import-form";
import { UseTemplateForm } from "./use-template-form";

export const dynamic = "force-dynamic";

/**
 * Job-scoped estimate worksheets (Send to Budget, CSV/template entry).
 *
 * Not in Financial nav — Financial → Budget shows the commitment funnel from
 * the approved/locked estimate. Jarvis drafting lives under Leads/Proposals only.
 */
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

  const rows = estimates.map((estimate) => ({
    id: estimate.id,
    jobId: job.id,
    title: estimate.title,
    status: estimate.status,
    createdAt: estimate.createdAt.toISOString(),
    clientPriceCents: estimate.lineItems.reduce((total, item) => {
      const cost = extendedCostCents(item.quantityMilli, item.unitCostCents);
      return total + priceWithRate(cost, item.rateMode, item.rateBasisPoints);
    }, 0),
  }));

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 p-4 sm:p-6">
      <FinancialPageHeader
        jobName={job.name}
        title="Estimate worksheets"
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/jobs/${job.id}/budget`}
              className="rounded border px-3 py-2 text-sm font-medium text-[var(--bt-text)]"
              style={{ borderColor: "var(--bt-border)" }}
            >
              View Budget
            </Link>
            <CreateModal triggerLabel="Import CSV" title="Import estimate from CSV" variant="secondary">
              <CsvImportForm jobId={job.id} />
            </CreateModal>
            <CreateModal triggerLabel="Use template" title="New estimate from template" variant="secondary">
              <UseTemplateForm jobId={job.id} templates={templates.map((t) => ({ id: t.id, name: t.name, lineItemCount: t.lineItems.length }))} />
            </CreateModal>
            <CreateModal triggerLabel="+ Worksheet" title="New estimate worksheet">
              <CreateEstimateForm jobId={job.id} costCodes={costCodes} materials={materials} />
            </CreateModal>
          </div>
        }
      />

      <div
        className="rounded-lg border px-3 py-2.5 text-sm text-[var(--bt-muted)] sm:px-4"
        style={{ borderColor: "var(--bt-border)", background: "var(--bt-panel-bg)" }}
      >
        Job Financials → <Link href={`/jobs/${job.id}/budget`} className="font-medium text-[var(--bt-primary)] hover:underline">Budget</Link>{" "}
        shows the commitment-funnel breakdown from the approved proposal / Send to Budget.
        Draft with Jarvis under <Link href="/leads" className="font-medium text-[var(--bt-primary)] hover:underline">Leads → Proposals</Link>
        — not here.
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={<ChartIcon className="h-10 w-10" />}
          title="No estimate worksheets on this job"
          description="Worksheets are for Send to Budget and PO sourcing. For Jarvis-assisted drafting, use Leads → Proposals. The job Budget view is under Financial → Budget."
          action={
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Link
                href={`/jobs/${job.id}/budget`}
                className="rounded border px-3 py-2 text-sm font-medium text-[var(--bt-text)]"
                style={{ borderColor: "var(--bt-border)" }}
              >
                View Budget
              </Link>
              <CreateModal triggerLabel="+ Worksheet" title="New estimate worksheet">
                <CreateEstimateForm jobId={job.id} costCodes={costCodes} materials={materials} />
              </CreateModal>
            </div>
          }
        />
      ) : (
        <EstimatesGrid rows={rows} />
      )}
    </div>
  );
}
