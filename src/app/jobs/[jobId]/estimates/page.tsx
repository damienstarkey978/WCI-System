import { notFound } from "next/navigation";

import { SetupNotice } from "@/app/admin/setup-notice";
import { CreateModal } from "@/components/shell/CreateModal";
import { EmptyState } from "@/components/shell/EmptyState";
import { JarvisChatPanel } from "@/components/jarvis/JarvisChatPanel";
import { currentAppUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { extendedCostCents, priceWithRate } from "@/lib/budget/funnel";
import { isAnthropicConfigured } from "@/lib/env";
import { isJarvisUiEnabled } from "@/lib/feature-flags";
import { listEstimateTemplates } from "@/lib/estimates/templates";
import { listMaterialCatalogItems } from "@/lib/materials/service";

import { CreateEstimateForm } from "./create-estimate-form";
import { EstimatesGrid } from "./estimates-grid";
import { FinancialPageHeader } from "../financial-tabs";
import { CsvImportForm } from "./csv-import-form";
import { UseTemplateForm } from "./use-template-form";

export const dynamic = "force-dynamic";

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
    <div className="mx-auto flex max-w-6xl flex-col gap-4 p-6">
      <FinancialPageHeader
        jobName={job.name}
        title="Estimate"
        action={
          <div className="flex items-center gap-2">
            <CreateModal triggerLabel="Import CSV" title="Import estimate from CSV" variant="secondary">
              <CsvImportForm jobId={job.id} />
            </CreateModal>
            <CreateModal triggerLabel="Use template" title="New estimate from template" variant="secondary">
              <UseTemplateForm jobId={job.id} templates={templates.map((t) => ({ id: t.id, name: t.name, lineItemCount: t.lineItems.length }))} />
            </CreateModal>
            <CreateModal triggerLabel="+ Estimate" title="New estimate">
              <CreateEstimateForm jobId={job.id} costCodes={costCodes} materials={materials} />
            </CreateModal>
          </div>
        }
      />

      {isAnthropicConfigured() && isJarvisUiEnabled() ? (
        <JarvisChatPanel
          context={{ page: "job_detail", jobId: job.id, jobName: job.name, section: "estimates" }}
          storageKey={`job-estimates:${job.id}`}
          emptyStateHint="Describe the scope of work — measurements, materials, anything relevant — and Jarvis drafts a full cost-coded estimate against this job's catalog. Attach photos and it'll factor those in too."
          heightClassName="h-96"
        />
      ) : null}

      {rows.length === 0 ? (
        <EmptyState title="No estimates yet" description="Estimates created for this job will appear here." />
      ) : (
        <EstimatesGrid rows={rows} />
      )}
    </div>
  );
}
