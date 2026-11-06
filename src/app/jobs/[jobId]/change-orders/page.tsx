import { notFound } from "next/navigation";

import { SetupNotice } from "@/app/admin/setup-notice";
import { EmptyState } from "@/components/shell/EmptyState";
import { DocumentIcon } from "@/components/shell/icons";
import { JarvisChatPanel } from "@/components/jarvis/JarvisChatPanel";
import { currentAppUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { extendedCostCents, priceWithRate } from "@/lib/budget/funnel";
import { isAnthropicConfigured } from "@/lib/env";
import { isJarvisUiEnabled } from "@/lib/feature-flags";

import { ChangeOrdersChrome } from "./change-orders-chrome";
import { ChangeOrdersGrid } from "./change-orders-grid";
import { CreateChangeOrderModal } from "./create-change-order-modal";

export const dynamic = "force-dynamic";

const STATUS_FILTERS = [
  { key: "all", label: "All" },
  { key: "not_sent", label: "Not sent" },
  { key: "sent", label: "Sent / Pending" },
  { key: "past_due", label: "Past due" },
  { key: "approved", label: "Approved" },
  { key: "declined", label: "Declined" },
] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number]["key"];

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

function builderCostCents(changeOrder: {
  mode: string;
  flatCostCents: number | null;
  lineItems: readonly { quantityMilli: number; unitCostCents: number }[];
}): number {
  if (changeOrder.mode === "FLAT") return changeOrder.flatCostCents ?? 0;
  return changeOrder.lineItems.reduce((total, item) => total + extendedCostCents(item.quantityMilli, item.unitCostCents), 0);
}

function formatCoNumber(n: number): string {
  return String(n).padStart(4, "0");
}

export default async function ChangeOrdersPage({ params, searchParams }: PageProps<"/jobs/[jobId]/change-orders">) {
  const { jobId } = await params;
  const { status: statusParam, q: qParam } = await searchParams;
  const statusFilter: StatusFilter = STATUS_FILTERS.some((f) => f.key === statusParam) ? (statusParam as StatusFilter) : "all";
  const q = typeof qParam === "string" ? qParam.trim() : "";

  let user;
  try {
    user = await currentAppUser();
  } catch (error) {
    return <SetupNotice detail={error instanceof Error ? error.message : String(error)} />;
  }
  if (!user) {
    return <SetupNotice detail="No organization found. Seed the database, then reload." />;
  }

  const job = await db.job.findFirst({
    where: { id: jobId, organizationId: user.organizationId },
    include: {
      clientAccess: {
        take: 1,
        include: { client: { select: { name: true } } },
      },
    },
  });
  if (!job) notFound();

  const clientName = job.clientAccess[0]?.client.name ?? null;

  const [changeOrders, costCodes] = await Promise.all([
    db.changeOrder.findMany({
      where: { jobId: job.id },
      orderBy: { number: "desc" },
      include: { lineItems: true },
    }),
    db.costCode.findMany({
      where: { organizationId: user.organizationId, isActive: true },
      orderBy: { sortOrder: "asc" },
      select: { id: true, code: true, name: true },
    }),
  ]);

  const now = new Date();
  const rows = changeOrders.map((co) => {
    const pastDue =
      co.status === "PENDING_APPROVAL" && co.deadline !== null && co.deadline.getTime() < now.getTime();
    return {
      id: co.id,
      jobId: job.id,
      number: co.number,
      title: co.title,
      mode: co.mode,
      status: co.status,
      createdAt: co.createdAt.toISOString(),
      statusChangedAt: co.statusChangedAt.toISOString(),
      deadline: co.deadline ? co.deadline.toISOString() : null,
      builderCostCents: builderCostCents(co),
      clientPriceCents: clientPriceCents(co),
      pastDue,
    };
  });

  const filtered = rows.filter((row) => {
    if (q) {
      const haystack = `${formatCoNumber(row.number)} ${row.title}`.toLowerCase();
      if (!haystack.includes(q.toLowerCase())) return false;
    }
    switch (statusFilter) {
      case "not_sent":
        return row.status === "DRAFT";
      case "sent":
        return row.status === "PENDING_APPROVAL" && !row.pastDue;
      case "past_due":
        return row.pastDue;
      case "approved":
        return row.status === "APPROVED";
      case "declined":
        return row.status === "DECLINED";
      default:
        return true;
    }
  });

  const createAction = (
    <CreateChangeOrderModal jobId={job.id} jobName={job.name} costCodes={costCodes} clientName={clientName} />
  );

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 p-6">
      <ChangeOrdersChrome jobId={job.id} jobName={job.name} status={statusFilter} q={q} createAction={createAction}>
        {isAnthropicConfigured() && isJarvisUiEnabled() ? (
          <JarvisChatPanel
            context={{ page: "job_detail", jobId: job.id, jobName: job.name, section: "change_orders" }}
            storageKey={`job-change-orders:${job.id}`}
            emptyStateHint="Describe what changed — added scope, a client request, a field condition — and Jarvis drafts a full itemized change order against this job's catalog. Attach photos and it'll factor those in too."
            heightClassName="h-96"
          />
        ) : null}

        {filtered.length === 0 ? (
          <EmptyState
            icon={<DocumentIcon className="h-10 w-10" />}
            title={q || statusFilter !== "all" ? "No matching change orders" : "No change orders yet"}
            description={
              q || statusFilter !== "all"
                ? "Try clearing search or status filters."
                : "Change orders created for this job will appear here."
            }
            action={createAction}
          />
        ) : (
          <ChangeOrdersGrid rows={filtered} />
        )}
      </ChangeOrdersChrome>
    </div>
  );
}
