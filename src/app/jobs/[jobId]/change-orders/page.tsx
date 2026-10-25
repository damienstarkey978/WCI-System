import { notFound } from "next/navigation";

import { SetupNotice } from "@/app/admin/setup-notice";
import { CreateModal } from "@/components/shell/CreateModal";
import { PageHeader } from "@/components/shell/PageHeader";
import { EmptyState } from "@/components/shell/EmptyState";
import { JarvisChatPanel } from "@/components/jarvis/JarvisChatPanel";
import { currentAppUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { extendedCostCents, priceWithRate } from "@/lib/budget/funnel";
import { isAnthropicConfigured } from "@/lib/env";
import { isJarvisUiEnabled } from "@/lib/feature-flags";

import { ChangeOrdersGrid } from "./change-orders-grid";
import { CreateChangeOrderForm } from "./create-change-order-form";

export const dynamic = "force-dynamic";

function clientPriceCents(changeOrder: {
  mode: string;
  flatClientPriceCents: number | null;
  lineItems: readonly { quantityMilli: number; unitCostCents: number; rateMode: string; rateBasisPoints: number }[];
}): number {
  if (changeOrder.mode === "FLAT") return changeOrder.flatClientPriceCents ?? 0;
  return changeOrder.lineItems.reduce((total, item) => {
    const cost = extendedCostCents(item.quantityMilli, item.unitCostCents);
    return total + priceWithRate(cost, item.rateMode as "MARKUP" | "MARGIN", item.rateBasisPoints);
  }, 0);
}

export default async function ChangeOrdersPage({ params }: PageProps<"/jobs/[jobId]/change-orders">) {
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

  const [changeOrders, costCodes] = await Promise.all([
    db.changeOrder.findMany({
      where: { jobId: job.id },
      orderBy: { createdAt: "desc" },
      include: { lineItems: true },
    }),
    db.costCode.findMany({
      where: { organizationId: user.organizationId, isActive: true },
      orderBy: { sortOrder: "asc" },
      select: { id: true, code: true, name: true },
    }),
  ]);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 p-6">
      <PageHeader
        jobName={job.name}
        title="Change Orders"
        action={
          <div className="flex items-center gap-2">
            <CreateModal triggerLabel="+ Change Order" title="New change order">
              <CreateChangeOrderForm jobId={job.id} costCodes={costCodes} />
            </CreateModal>
          </div>
        }
      />

      {isAnthropicConfigured() && isJarvisUiEnabled() ? (
        <JarvisChatPanel
          context={{ page: "job_detail", jobId: job.id, jobName: job.name, section: "change_orders" }}
          storageKey={`job-change-orders:${job.id}`}
          emptyStateHint="Describe what changed — added scope, a client request, a field condition — and Jarvis drafts a full itemized change order against this job's catalog. Attach photos and it'll factor those in too."
          heightClassName="h-96"
        />
      ) : null}


      {changeOrders.length === 0 ? (
        <EmptyState title="No change orders yet" description="Change orders created for this job will appear here." />
      ) : (
        <ChangeOrdersGrid
          rows={changeOrders.map((co) => ({
            id: co.id,
            jobId: job.id,
            title: co.title,
            mode: co.mode,
            status: co.status,
            createdAt: co.createdAt.toISOString(),
            clientPriceCents: clientPriceCents(co),
          }))}
        />
      )}
    </div>
  );
}
