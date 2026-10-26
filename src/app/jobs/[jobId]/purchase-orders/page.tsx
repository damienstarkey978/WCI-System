import { notFound } from "next/navigation";

import { SetupNotice } from "@/app/admin/setup-notice";
import { CreateModal } from "@/components/shell/CreateModal";
import { EmptyState } from "@/components/shell/EmptyState";
import { extendedCostCents } from "@/lib/budget/funnel";
import { currentAppUser } from "@/lib/auth";
import { db } from "@/lib/db";

import { CreatePoForm } from "./create-po-form";
import { PurchaseOrdersBillsTabs, FinancialPageHeader } from "../financial-tabs";
import { PurchaseOrdersGrid } from "./purchase-orders-grid";

export const dynamic = "force-dynamic";

export default async function PurchaseOrdersPage({ params }: PageProps<"/jobs/[jobId]/purchase-orders">) {
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

  const [purchaseOrders, costCodes] = await Promise.all([
    db.purchaseOrder.findMany({
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

  const rows = purchaseOrders.map((po) => ({
    id: po.id,
    jobId: job.id,
    jobName: job.name,
    poNumber: po.poNumber,
    poSuffix: po.poSuffix,
    title: po.title,
    vendorName: po.vendorName,
    status: po.status,
    workStatus: po.workStatus,
    createdAt: po.createdAt.toISOString(),
    totalCents: po.lineItems.reduce((total, item) => total + extendedCostCents(item.quantityMilli, item.unitCostCents), 0),
  }));

  const createAction = (
    <CreateModal triggerLabel="+ Purchase Order" title="New purchase order">
      <CreatePoForm jobId={job.id} costCodes={costCodes} />
    </CreateModal>
  );

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 p-6">
      <FinancialPageHeader jobName={job.name} title="Purchase Orders" action={createAction} />

      <PurchaseOrdersBillsTabs jobId={job.id} active="purchase-orders" />

      {rows.length === 0 ? (
        <EmptyState
          title="No purchase orders yet"
          description="Create a purchase order for materials or subcontract work on this job."
          action={createAction}
        />
      ) : (
        <PurchaseOrdersGrid rows={rows} />
      )}
    </div>
  );
}
