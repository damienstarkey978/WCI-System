import Link from "next/link";
import { notFound } from "next/navigation";

import { SetupNotice } from "@/app/admin/setup-notice";
import { EmptyState } from "@/components/shell/EmptyState";
import { HammerIcon } from "@/components/shell/icons";
import { PageHeader } from "@/components/shell/PageHeader";
import { currentAppUser } from "@/lib/auth";
import { formatMoney } from "@/lib/format";
import {
  JobNotFoundForPurchasingError,
  loadJobPurchasingSummary,
} from "@/lib/takeoffs/load-purchasing-summary";
import type { PurchasingBucket } from "@/lib/takeoffs/purchasing-summary";

export const dynamic = "force-dynamic";

const BUCKET_LABEL: Record<PurchasingBucket, string> = {
  not_yet: "Not yet purchased",
  queued: "Queued for Estimating",
  on_order: "On order",
  purchased: "Purchased / complete",
};

const BUCKET_STYLE: Record<PurchasingBucket, { bg: string; text: string }> = {
  not_yet: { bg: "#e5e7eb", text: "#374151" },
  queued: { bg: "color-mix(in srgb, var(--bt-hazard) 14%, transparent)", text: "var(--bt-hazard)" },
  on_order: { bg: "color-mix(in srgb, var(--bt-primary) 14%, transparent)", text: "var(--bt-primary)" },
  purchased: { bg: "var(--bt-status-open-bg)", text: "var(--bt-status-open-text)" },
};

export default async function JobPurchasingPage({ params }: PageProps<"/jobs/[jobId]/purchasing">) {
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

  let loaded;
  try {
    loaded = await loadJobPurchasingSummary(user.organizationId, jobId);
  } catch (error) {
    if (error instanceof JobNotFoundForPurchasingError) notFound();
    throw error;
  }

  const { job, summary } = loaded;
  const cards = [
    { key: "not_yet" as const, count: summary.totals.notYetCount, cents: summary.totals.notYetCents },
    { key: "queued" as const, count: summary.totals.queuedCount, cents: summary.totals.queuedCents },
    { key: "on_order" as const, count: summary.totals.onOrderCount, cents: summary.totals.onOrderCents },
    { key: "purchased" as const, count: summary.totals.purchasedCount, cents: summary.totals.purchasedCents },
  ];

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 p-4 sm:p-6">
      <PageHeader
        jobName={job.name}
        title="Purchasing"
        action={
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/jobs/${job.id}/takeoffs`}
              className="rounded border px-3 py-2 text-sm font-semibold"
              style={{ borderColor: "var(--bt-border)" }}
            >
              Takeoffs
            </Link>
            <Link
              href={`/jobs/${job.id}/purchase-orders`}
              className="rounded px-3 py-2 text-sm font-semibold text-[var(--bt-on-primary)]"
              style={{ background: "var(--bt-primary)" }}
            >
              Purchase Orders
            </Link>
          </div>
        }
      />

      <p className="text-sm text-[var(--bt-muted)]">
        What still needs buying vs what&apos;s on a PO for this job — rollup of takeoffs and purchase-order status, not a
        second AP system.
      </p>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map((card) => (
          <div
            key={card.key}
            className="rounded-lg border p-3"
            style={{ borderColor: "var(--bt-border)", background: "var(--bt-panel-bg)" }}
          >
            <div className="text-xs font-medium uppercase tracking-wide text-[var(--bt-muted)]">
              {BUCKET_LABEL[card.key]}
            </div>
            <div className="mt-1 text-2xl font-semibold text-[var(--bt-text)]">{card.count}</div>
            <div className="text-sm text-[var(--bt-muted)]">{formatMoney(card.cents)}</div>
          </div>
        ))}
      </div>

      {summary.rows.length === 0 ? (
        <EmptyState
          icon={<HammerIcon className="h-10 w-10" />}
          title="Nothing to track yet"
          description="Draft a takeoff or create a purchase order for this job to see purchased vs not-yet here."
          action={
            <Link
              href={`/jobs/${job.id}/takeoffs`}
              className="rounded px-3 py-2 text-sm font-semibold text-[var(--bt-on-primary)]"
              style={{ background: "var(--bt-primary)" }}
            >
              Open Takeoffs
            </Link>
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border" style={{ borderColor: "var(--bt-border)" }}>
          <table className="min-w-full text-left text-sm">
            <thead className="bg-[var(--bt-panel-bg)] text-xs uppercase tracking-wide text-[var(--bt-muted)]">
              <tr>
                <th className="px-3 py-2 font-medium">Item</th>
                <th className="px-3 py-2 font-medium">Bucket</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {summary.rows.map((row) => {
                const style = BUCKET_STYLE[row.bucket];
                return (
                  <tr key={`${row.kind}-${row.id}`} className="border-t align-top" style={{ borderColor: "var(--bt-border)" }}>
                    <td className="px-3 py-2.5">
                      <Link href={row.href} className="font-medium text-[var(--bt-primary)] hover:underline">
                        {row.label}
                      </Link>
                      <div className="mt-0.5 text-xs text-[var(--bt-muted)]">{row.detail}</div>
                      {row.costCodeLabel ? (
                        <div className="text-xs text-[var(--bt-muted)]">{row.costCodeLabel}</div>
                      ) : null}
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className="inline-block rounded px-2 py-0.5 text-xs font-semibold"
                        style={{ background: style.bg, color: style.text }}
                      >
                        {BUCKET_LABEL[row.bucket]}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-[var(--bt-text)]">{row.statusLabel}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-[var(--bt-text)]">
                      {formatMoney(row.amountCents)}
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
