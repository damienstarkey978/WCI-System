import Link from "next/link";
import { notFound } from "next/navigation";

import { SetupNotice } from "@/app/admin/setup-notice";
import { OutboundBrandMark } from "@/components/branding/OutboundBrandMark";
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

  const [job, organization] = await Promise.all([
    db.job.findFirst({ where: { id: jobId, organizationId: user.organizationId } }),
    db.organization.findUnique({
      where: { id: user.organizationId },
      select: { name: true, logoPath: true, addressLine1: true, city: true, state: true, postalCode: true, contactEmail: true, contactPhone: true },
    }),
  ]);
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

  const jobAddress = [job.addressLine1, job.city, job.state, job.postalCode].filter(Boolean).join(", ") || null;
  const orgAddress = organization
    ? [organization.addressLine1, organization.city, organization.state, organization.postalCode].filter(Boolean).join(", ")
    : "";

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
        <div className="rounded-xl p-3 sm:p-6" style={{ background: "var(--bt-panel-bg-muted)" }}>
          <p className="mb-4 text-sm text-[var(--bt-muted)]">
            Preview of what the client sees. Builder notes and builder cost are never shown here. Clients approve from a signed link once marked sent.
          </p>
          <article className="mx-auto max-w-3xl rounded-lg border bg-white px-4 py-6 text-[#1a1a1a] shadow-sm sm:px-10 sm:py-10 print:shadow-none" style={{ borderColor: "#e5e7eb" }}>
            <header className="flex flex-col items-center gap-2 text-center">
              <OutboundBrandMark organizationLogoPath={organization?.logoPath ?? null} className="h-14 w-auto max-w-[14rem] object-contain sm:h-16" />
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[#6b7280]">
                {organization?.name ?? "World Construction Inc"}
              </div>
            </header>

            <div className="mt-6 border-t border-[#e5e7eb] pt-5 text-center sm:text-left">
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#9ca3af]">Change Order</div>
              <h2 className="mt-1 text-2xl font-semibold tracking-tight">
                {changeOrder.title} <span className="text-[#6b7280]">#{coNumber}</span>
              </h2>
              <p className="mt-1 text-sm text-[#6b7280]">{job.name}{jobAddress ? ` · ${jobAddress}` : ""}</p>
            </div>

            <div className="mt-6 grid gap-4 border-t border-[#e5e7eb] pt-5 text-sm sm:grid-cols-2">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wide text-[#9ca3af]">Prepared by</div>
                <div className="mt-1 font-medium">{organization?.name ?? "World Construction Inc"}</div>
                {orgAddress ? <div className="text-xs text-[#6b7280]">{orgAddress}</div> : null}
                {organization?.contactEmail ? <div className="text-xs text-[#6b7280]">{organization.contactEmail}</div> : null}
              </div>
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wide text-[#9ca3af]">Date</div>
                <div className="mt-1 font-medium">{formatDateUtc(changeOrder.createdAt)}</div>
                {changeOrder.deadline ? (
                  <div className="mt-1 text-xs text-[#6b7280]">Respond by {formatDateUtc(changeOrder.deadline)}</div>
                ) : null}
              </div>
            </div>

            <section className="mt-6 border-t border-[#e5e7eb] pt-5">
              <h3 className="text-sm font-semibold">Scope of work</h3>
              {changeOrder.notesClient ? (
                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-[#374151]">{changeOrder.notesClient}</p>
              ) : (
                <p className="mt-2 text-sm italic text-[#9ca3af]">No client-facing scope notes yet.</p>
              )}
            </section>

            <div className="mt-6 overflow-hidden rounded border border-[#e5e7eb]">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-[#e5e7eb] bg-[#f9fafb] text-[10px] font-semibold uppercase tracking-wide text-[#6b7280]">
                    <th className="px-3 py-2">Description</th>
                    <th className="px-3 py-2 text-right">Qty</th>
                    <th className="px-3 py-2 text-right">Price</th>
                  </tr>
                </thead>
                <tbody>
                  {lineRows.map((row) => (
                    <tr key={row.id} className="border-t border-[#e5e7eb]">
                      <td className="px-3 py-2">
                        {row.title}
                        {row.code ? <span className="ml-1 text-xs text-[#9ca3af]">({row.code})</span> : null}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{row.qtyLabel}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatMoney(row.priceCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-4 flex items-baseline justify-between gap-3 text-base font-semibold">
              <span>Total</span>
              <span className="tabular-nums" style={{ color: "var(--bt-primary)" }}>
                {formatMoney(clientPrice)}
              </span>
            </p>
          </article>
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
