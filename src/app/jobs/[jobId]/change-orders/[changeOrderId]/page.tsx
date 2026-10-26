import Link from "next/link";
import { notFound } from "next/navigation";

import { SetupNotice } from "@/app/admin/setup-notice";
import { PageHeader } from "@/components/shell/PageHeader";
import { currentAppUser } from "@/lib/auth";
import { extendedCostCents, priceWithRate } from "@/lib/budget/funnel";
import { db } from "@/lib/db";
import { formatDateUtc, formatMoney } from "@/lib/format";

import {
  approveChangeOrderAction,
  declineChangeOrderAction,
  markChangeOrderSentAction,
} from "../actions";
import { ChangeOrderDetailForm } from "./detail-form";

export const dynamic = "force-dynamic";

const STATUS_BADGE: Record<string, { bg: string; text: string; label: string }> = {
  DRAFT: { bg: "#e5e7eb", text: "#374151", label: "Draft" },
  PENDING_APPROVAL: { bg: "color-mix(in srgb, var(--bt-hazard) 14%, transparent)", text: "var(--bt-hazard)", label: "Sent / Pending" },
  APPROVED: { bg: "var(--bt-status-open-bg)", text: "var(--bt-status-open-text)", label: "Approved" },
  DECLINED: { bg: "color-mix(in srgb, var(--bt-danger) 14%, transparent)", text: "var(--bt-danger)", label: "Declined" },
};

export default async function ChangeOrderDetailPage({
  params,
  searchParams,
}: PageProps<"/jobs/[jobId]/change-orders/[changeOrderId]">) {
  const { jobId, changeOrderId } = await params;
  const { tab: tabParam } = await searchParams;
  const tab = tabParam === "preview" ? "preview" : "details";

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

  const changeOrder = await db.changeOrder.findFirst({
    where: { id: changeOrderId, jobId: job.id, organizationId: user.organizationId },
    include: {
      lineItems: {
        include: { costCode: { select: { code: true, name: true } } },
        orderBy: { sortOrder: "asc" },
      },
    },
  });
  if (!changeOrder) notFound();

  const builderCost =
    changeOrder.mode === "FLAT"
      ? (changeOrder.flatCostCents ?? 0)
      : changeOrder.lineItems.reduce((sum, item) => sum + extendedCostCents(item.quantityMilli, item.unitCostCents), 0);
  const clientPrice =
    changeOrder.mode === "FLAT"
      ? (changeOrder.flatClientPriceCents ?? 0)
      : changeOrder.lineItems.reduce((sum, item) => {
          const cost = extendedCostCents(item.quantityMilli, item.unitCostCents);
          return sum + priceWithRate(cost, item.rateMode, item.rateBasisPoints);
        }, 0);
  const profit = clientPrice - builderCost;
  const coNumber = String(changeOrder.number).padStart(4, "0");
  const editable = changeOrder.status === "DRAFT" || changeOrder.status === "PENDING_APPROVAL";
  const badge = STATUS_BADGE[changeOrder.status] ?? STATUS_BADGE.DRAFT;

  const lineRows =
    changeOrder.mode === "FLAT"
      ? [
          {
            id: "flat",
            title: changeOrder.title,
            code: null as string | null,
            qtyLabel: "1",
            costCents: builderCost,
            priceCents: clientPrice,
          },
        ]
      : changeOrder.lineItems.map((item) => {
          const cost = extendedCostCents(item.quantityMilli, item.unitCostCents);
          const price = priceWithRate(cost, item.rateMode, item.rateBasisPoints);
          return {
            id: item.id,
            title: item.title,
            code: item.costCode.code,
            qtyLabel: (item.quantityMilli / 1000).toFixed(item.quantityMilli % 1000 === 0 ? 0 : 3),
            costCents: cost,
            priceCents: price,
          };
        });

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href={`/jobs/${job.id}/change-orders`} className="text-xs font-medium text-[var(--bt-primary)] hover:underline">
            ← Change Orders
          </Link>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <PageHeader jobName={job.name} title="Change Order" />
            <span className="rounded-full px-2 py-0.5 text-xs font-semibold" style={{ background: badge.bg, color: badge.text }}>
              {badge.label}
            </span>
          </div>
          <p className="mt-1 text-sm text-[var(--bt-muted)]">
            #{coNumber}
            {changeOrder.deadline ? ` · Deadline ${formatDateUtc(changeOrder.deadline)}` : ""}
          </p>
        </div>
        {editable ? (
          <div className="flex flex-wrap items-center gap-2">
            {changeOrder.status === "DRAFT" ? (
              <form action={markChangeOrderSentAction}>
                <input type="hidden" name="jobId" value={job.id} />
                <input type="hidden" name="changeOrderId" value={changeOrder.id} />
                <button
                  type="submit"
                  className="rounded px-3 py-2 text-sm font-semibold text-[var(--bt-on-primary)]"
                  style={{ background: "var(--bt-primary)" }}
                  title="Marks as sent/pending. Does not email anyone."
                >
                  Mark sent
                </button>
              </form>
            ) : null}
            <form action={declineChangeOrderAction}>
              <input type="hidden" name="jobId" value={job.id} />
              <input type="hidden" name="changeOrderId" value={changeOrder.id} />
              <button type="submit" className="rounded border px-3 py-2 text-sm font-semibold" style={{ borderColor: "var(--bt-border)" }}>
                Decline
              </button>
            </form>
            <form action={approveChangeOrderAction}>
              <input type="hidden" name="jobId" value={job.id} />
              <input type="hidden" name="changeOrderId" value={changeOrder.id} />
              <button type="submit" className="rounded border px-3 py-2 text-sm font-semibold" style={{ borderColor: "var(--bt-border)" }}>
                Approve
              </button>
            </form>
          </div>
        ) : null}
      </div>

      <nav className="flex gap-1 border-b" style={{ borderColor: "var(--bt-border)" }}>
        {(
          [
            ["details", "Details"],
            ["preview", "Client preview"],
          ] as const
        ).map(([key, label]) => (
          <Link
            key={key}
            href={`/jobs/${job.id}/change-orders/${changeOrder.id}${key === "preview" ? "?tab=preview" : ""}`}
            className="-mb-px border-b-2 px-3 py-2 text-sm font-medium"
            style={{
              borderColor: tab === key ? "var(--bt-primary)" : "transparent",
              color: tab === key ? "var(--bt-primary)" : "var(--bt-muted)",
            }}
          >
            {label}
          </Link>
        ))}
      </nav>

      {tab === "details" ? (
        <>
          <ChangeOrderDetailForm
            jobId={job.id}
            changeOrderId={changeOrder.id}
            coNumber={coNumber}
            editable={editable}
            initial={{
              title: changeOrder.title,
              deadline: changeOrder.deadline ? changeOrder.deadline.toISOString().slice(0, 10) : "",
              notesBuilder: changeOrder.notesBuilder ?? "",
              notesClient: changeOrder.notesClient ?? "",
              invoiceOnApproval: changeOrder.invoiceOnApproval,
            }}
          />

          <section className="rounded-lg border bg-[var(--bt-panel-bg)] p-4" style={{ borderColor: "var(--bt-border)" }}>
            <h2 className="text-sm font-semibold text-[var(--bt-text)]">Line items</h2>
            {lineRows.length === 0 ? (
              <p className="mt-2 text-sm text-[var(--bt-muted)]">No line items yet. Add line items when creating the change order.</p>
            ) : (
              <div className="mt-3 overflow-hidden rounded border" style={{ borderColor: "var(--bt-border)" }}>
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b text-xs uppercase tracking-wide text-[var(--bt-muted)]" style={{ borderColor: "var(--bt-border)" }}>
                      <th className="px-3 py-2">Description</th>
                      <th className="px-3 py-2 text-right">Qty</th>
                      <th className="px-3 py-2 text-right">Builder cost</th>
                      <th className="px-3 py-2 text-right">Client price</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lineRows.map((row) => (
                      <tr key={row.id} className="border-t" style={{ borderColor: "var(--bt-border)" }}>
                        <td className="px-3 py-2">
                          {row.title}
                          {row.code ? <span className="ml-1 text-xs text-[var(--bt-muted)]">({row.code})</span> : null}
                        </td>
                        <td className="px-3 py-2 text-right">{row.qtyLabel}</td>
                        <td className="px-3 py-2 text-right">{formatMoney(row.costCents)}</td>
                        <td className="px-3 py-2 text-right">{formatMoney(row.priceCents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="mt-2 text-xs text-[var(--bt-muted)]">
              {changeOrder.mode === "FLAT" ? "Flat fee pricing." : "Itemized pricing. Line edits happen on create; use a new change order to revise scope."}
            </p>
          </section>
        </>
      ) : (
        <div className="rounded-lg border bg-[var(--bt-panel-bg)] p-6" style={{ borderColor: "var(--bt-border)" }}>
          <p className="mb-4 text-sm text-[var(--bt-muted)]">
            Preview of what the client sees. Builder notes and builder cost are never shown here. Clients approve from a signed link once marked sent.
          </p>
          <h2 className="text-lg font-semibold text-[var(--bt-text)]">
            {changeOrder.title} (#{coNumber})
          </h2>
          {changeOrder.notesClient ? (
            <p className="mt-3 whitespace-pre-wrap text-sm text-[var(--bt-text)]">{changeOrder.notesClient}</p>
          ) : (
            <p className="mt-3 text-sm text-[var(--bt-muted)]">No scope of work.</p>
          )}
          <div className="mt-4 overflow-hidden rounded border" style={{ borderColor: "var(--bt-border)" }}>
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b text-xs uppercase tracking-wide text-[var(--bt-muted)]" style={{ borderColor: "var(--bt-border)" }}>
                  <th className="px-3 py-2">Description</th>
                  <th className="px-3 py-2 text-right">Qty</th>
                  <th className="px-3 py-2 text-right">Price</th>
                </tr>
              </thead>
              <tbody>
                {lineRows.map((row) => (
                  <tr key={row.id} className="border-t" style={{ borderColor: "var(--bt-border)" }}>
                    <td className="px-3 py-2">
                      {row.title}
                      {row.code ? <span className="ml-1 text-xs text-[var(--bt-muted)]">({row.code})</span> : null}
                    </td>
                    <td className="px-3 py-2 text-right">{row.qtyLabel}</td>
                    <td className="px-3 py-2 text-right">{formatMoney(row.priceCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-4 text-right text-base font-semibold text-[var(--bt-text)]">Total price: {formatMoney(clientPrice)}</p>
        </div>
      )}

      <div className="grid gap-2 rounded-lg border bg-[var(--bt-panel-bg)] px-4 py-3 text-sm sm:grid-cols-3" style={{ borderColor: "var(--bt-border)" }}>
        <div>
          <p className="text-xs text-[var(--bt-muted)]">Builder cost</p>
          <p className="font-semibold">{formatMoney(builderCost)}</p>
        </div>
        <div>
          <p className="text-xs text-[var(--bt-muted)]">Profit / markup</p>
          <p className="font-semibold">{formatMoney(profit)}</p>
        </div>
        <div>
          <p className="text-xs text-[var(--bt-muted)]">Client price</p>
          <p className="font-semibold">{formatMoney(clientPrice)}</p>
        </div>
      </div>
    </div>
  );
}
