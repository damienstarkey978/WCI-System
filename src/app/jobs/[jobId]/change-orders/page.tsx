import Link from "next/link";
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

export default async function ChangeOrdersPage({ params, searchParams }: PageProps<"/jobs/[jobId]/change-orders">) {
  const { jobId } = await params;
  const { status: statusParam } = await searchParams;
  const statusFilter: StatusFilter = STATUS_FILTERS.some((f) => f.key === statusParam) ? (statusParam as StatusFilter) : "all";

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

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 p-6">
      <PageHeader
        jobName={job.name}
        title="Change Orders"
        action={
          <div className="flex items-center gap-2">
            <CreateModal triggerLabel="+ Change Order" title="New change order" size="lg">
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

      <nav className="flex flex-wrap gap-1 border-b" style={{ borderColor: "var(--bt-border)" }}>
        {STATUS_FILTERS.map((filter) => (
          <Link
            key={filter.key}
            href={filter.key === "all" ? `/jobs/${job.id}/change-orders` : `/jobs/${job.id}/change-orders?status=${filter.key}`}
            className="-mb-px border-b-2 px-3 py-2 text-sm font-medium"
            style={{
              borderColor: statusFilter === filter.key ? "var(--bt-primary)" : "transparent",
              color: statusFilter === filter.key ? "var(--bt-primary)" : "var(--bt-muted)",
            }}
          >
            {filter.label}
          </Link>
        ))}
      </nav>

      {filtered.length === 0 ? (
        <EmptyState title="No change orders yet" description="Change orders created for this job will appear here." />
      ) : (
        <ChangeOrdersGrid rows={filtered} />
      )}
    </div>
  );
}
