import Link from "next/link";
import { notFound } from "next/navigation";

import { SetupNotice } from "@/app/admin/setup-notice";
import { OutboundBrandMark } from "@/components/branding/OutboundBrandMark";
import { currentAppUser } from "@/lib/auth";
import { extendedCostCents, priceWithRate } from "@/lib/budget/funnel";
import { db } from "@/lib/db";
import { formatDateUtc, formatMoney } from "@/lib/format";

import {
  approveChangeOrderAction,
  declineChangeOrderAction,
} from "../actions";
import { ChangeOrderDetailChrome } from "./co-detail-chrome";
import { ChangeOrderDetailForm } from "./detail-form";
import { ChangeOrderLineItemsEditor } from "./line-items-editor";
import { SendChangeOrderForApproval } from "./send-for-approval";

export const dynamic = "force-dynamic";

const STATUS_BADGE: Record<string, { bg: string; text: string; label: string }> = {
  DRAFT: { bg: "#e5e7eb", text: "#374151", label: "Draft" },
  PENDING_APPROVAL: { bg: "#fff4e5", text: "#b76e00", label: "Sent / Pending" },
  APPROVED: { bg: "#e6f4ea", text: "#1e7e34", label: "Approved" },
  DECLINED: { bg: "color-mix(in srgb, var(--bt-danger) 14%, transparent)", text: "var(--bt-danger)", label: "Declined" },
};

function costTypeLabel(costType: string): string {
  switch (costType) {
    case "LABOR":
      return "Labor";
    case "MATERIAL":
      return "Material";
    case "EQUIPMENT":
      return "Equipment";
    case "SUBCONTRACTOR":
      return "Subcontractor";
    case "OTHER":
      return "Other";
    default:
      return "None";
  }
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-xs font-medium text-[var(--bt-muted)]">{label}</div>
      <div className="mt-0.5 text-sm text-[var(--bt-text)]">{children}</div>
    </div>
  );
}

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
    db.job.findFirst({
      where: { id: jobId, organizationId: user.organizationId },
      include: {
        clientAccess: {
          take: 1,
          include: { client: { select: { name: true } } },
        },
      },
    }),
    db.organization.findUnique({
      where: { id: user.organizationId },
      select: {
        name: true,
        logoPath: true,
        addressLine1: true,
        city: true,
        state: true,
        postalCode: true,
        contactEmail: true,
        contactPhone: true,
      },
    }),
  ]);
  if (!job) notFound();

  const [changeOrder, costCodes] = await Promise.all([
    db.changeOrder.findFirst({
      where: { id: changeOrderId, jobId: job.id, organizationId: user.organizationId },
      include: {
        lineItems: {
          include: { costCode: { select: { code: true, name: true } } },
          orderBy: { sortOrder: "asc" },
        },
      },
    }),
    db.costCode.findMany({
      where: { organizationId: user.organizationId, isActive: true },
      orderBy: { sortOrder: "asc" },
      select: { id: true, code: true, name: true },
    }),
  ]);
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
  const clientName = job.clientAccess[0]?.client.name ?? null;
  const clientInitials = clientName
    ? clientName
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() ?? "")
        .join("")
    : "—";
  const clientLastViewed = changeOrder.clientSignedAt
    ? formatDateUtc(changeOrder.clientSignedAt)
    : changeOrder.status === "DRAFT"
      ? "—"
      : "Never";

  const lineRows =
    changeOrder.mode === "FLAT"
      ? [
          {
            id: "flat",
            group: changeOrder.title,
            title: changeOrder.title,
            description: changeOrder.notesBuilder ?? "",
            costType: "None",
            qtyLabel: "1",
            unitCostLabel: formatMoney(builderCost),
            amountLabel: formatMoney(clientPrice),
            code: null as string | null,
            costCents: builderCost,
            priceCents: clientPrice,
          },
        ]
      : changeOrder.lineItems.map((item) => {
          const cost = extendedCostCents(item.quantityMilli, item.unitCostCents);
          const price = priceWithRate(cost, item.rateMode, item.rateBasisPoints);
          return {
            id: item.id,
            group: item.costCode.name,
            title: item.title,
            description: "",
            costType: costTypeLabel(item.costType),
            qtyLabel: (item.quantityMilli / 1000).toFixed(item.quantityMilli % 1000 === 0 ? 0 : 3),
            unitCostLabel: formatMoney(item.unitCostCents),
            amountLabel: formatMoney(price),
            code: item.costCode.code,
            costCents: cost,
            priceCents: price,
          };
        });

  // Group consecutive lines that share a cost-code name (BT category headers).
  const grouped: { group: string; rows: typeof lineRows }[] = [];
  for (const row of lineRows) {
    const last = grouped[grouped.length - 1];
    if (last && last.group === row.group) last.rows.push(row);
    else grouped.push({ group: row.group, rows: [row] });
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 p-4 sm:p-6">
      <ChangeOrderDetailChrome
        jobId={job.id}
        changeOrderId={changeOrder.id}
        status={changeOrder.status}
        editable={editable}
        titleBlock={
          <div className="min-w-0">
            <Link
              href={`/jobs/${job.id}/change-orders`}
              className="inline-flex items-center gap-1 text-xs font-medium text-[var(--bt-muted)] hover:text-[var(--bt-primary)]"
              aria-label="Back to change orders"
            >
              <span aria-hidden>←</span>
              <span className="truncate">{job.name}</span>
            </Link>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold text-[var(--bt-text)]">Change Order</h1>
              <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: badge.bg, color: badge.text }}>
                {badge.label}
              </span>
            </div>
          </div>
        }
        statusActions={
          editable ? (
            <div className="flex flex-wrap items-center justify-end gap-2">
              <SendChangeOrderForApproval jobId={job.id} changeOrderId={changeOrder.id} status={changeOrder.status} />
              <form action={declineChangeOrderAction}>
                <input type="hidden" name="jobId" value={job.id} />
                <input type="hidden" name="changeOrderId" value={changeOrder.id} />
                <button type="submit" className="rounded border px-3 py-1.5 text-sm font-semibold" style={{ borderColor: "var(--bt-border)" }}>
                  Decline
                </button>
              </form>
              <form action={approveChangeOrderAction}>
                <input type="hidden" name="jobId" value={job.id} />
                <input type="hidden" name="changeOrderId" value={changeOrder.id} />
                <button type="submit" className="rounded border px-3 py-1.5 text-sm font-semibold" style={{ borderColor: "var(--bt-border)" }}>
                  Approve
                </button>
              </form>
            </div>
          ) : null
        }
        editForm={
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
        }
      />

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
            className="-mb-px border-b-2 px-3 py-2.5 text-sm font-medium"
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
          <section>
            <h2 className="text-sm font-semibold text-[var(--bt-text)]">Required client approvals</h2>
            <p className="mt-1 text-xs text-[var(--bt-muted)]">
              All clients you select will be required to sign this Change Order in order for it to be marked approved.
            </p>
            <div className="mt-3">
              <div className="text-xs font-semibold text-[var(--bt-muted)]">Required Approvers</div>
              <div
                className="mt-1 flex min-h-[2.25rem] flex-wrap items-center gap-1.5 rounded border px-2 py-1.5"
                style={{ borderColor: "var(--bt-border)" }}
              >
                {clientName ? (
                  <span
                    className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium"
                    style={{ background: "color-mix(in srgb, var(--bt-primary) 12%, white)", color: "var(--bt-primary)" }}
                  >
                    <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-white text-[10px] font-bold">
                      {clientInitials}
                    </span>
                    {clientName}
                  </span>
                ) : (
                  <span className="text-sm text-[var(--bt-muted)]">No client on this job yet.</span>
                )}
              </div>
            </div>
          </section>

          <div className="grid gap-4 border-b pb-4 sm:grid-cols-2 lg:grid-cols-4" style={{ borderColor: "var(--bt-border)" }}>
            <Field label="Title">{changeOrder.title}</Field>
            <Field label="ID#">{coNumber}</Field>
            <Field label="Approval Deadline">{changeOrder.deadline ? formatDateUtc(changeOrder.deadline) : "—"}</Field>
            <Field label="Client Last Viewed">{clientLastViewed}</Field>
          </div>

          <section id="co-line-items" className="flex flex-col gap-3">
            {lineRows.length > 0 ? (
              <div className="overflow-hidden rounded border" style={{ borderColor: "var(--bt-border)" }}>
                <div className="min-w-0 overflow-x-auto">
                  <table className="w-full min-w-max text-left text-sm">
                    <thead>
                      <tr
                        className="border-b text-[10px] font-semibold uppercase tracking-wide text-[var(--bt-muted)]"
                        style={{ borderColor: "var(--bt-border)", background: "var(--bt-panel-bg-muted)" }}
                      >
                        <th className="px-3 py-2">Items</th>
                        <th className="px-3 py-2">Description</th>
                        <th className="px-3 py-2">Internal Notes</th>
                        <th className="px-3 py-2">Cost type</th>
                        <th className="px-3 py-2 text-right">Unit cost</th>
                        <th className="px-3 py-2 text-right">Qty</th>
                        <th className="px-3 py-2 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {grouped.flatMap((group) => [
                        <tr key={`g-${group.group}`} className="border-t" style={{ borderColor: "var(--bt-border)" }}>
                          <td colSpan={7} className="px-3 py-2 text-sm font-semibold text-[var(--bt-text)]">
                            {group.group}
                          </td>
                        </tr>,
                        ...group.rows.map((row) => (
                          <tr key={row.id} className="border-t" style={{ borderColor: "var(--bt-border)" }}>
                            <td className="px-3 py-2">
                              <div className="text-[var(--bt-text)]">{row.title}</div>
                              {row.code ? <div className="text-xs text-[var(--bt-muted)]">{row.code}</div> : null}
                            </td>
                            <td className="px-3 py-2 text-[var(--bt-muted)]">{row.description || "—"}</td>
                            <td className="px-3 py-2 text-[var(--bt-muted)]">—</td>
                            <td className="px-3 py-2 text-[var(--bt-muted)]">{row.costType}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{row.unitCostLabel}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{row.qtyLabel}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{row.amountLabel}</td>
                          </tr>
                        )),
                      ])}
                      <tr className="border-t font-semibold" style={{ borderColor: "var(--bt-border)", background: "var(--bt-panel-bg-muted)" }}>
                        <td className="px-3 py-2" colSpan={6}>
                          Totals
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatMoney(clientPrice)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}
            {editable ? (
              <ChangeOrderLineItemsEditor
                jobId={job.id}
                changeOrderId={changeOrder.id}
                costCodes={costCodes}
                hasLines={lineRows.length > 0}
              />
            ) : lineRows.length === 0 ? (
              <p className="text-sm text-[var(--bt-muted)]">No line items on this change order.</p>
            ) : null}
          </section>

          <section>
            <h2 className="text-sm font-semibold text-[var(--bt-text)]">Scope of Work</h2>
            {changeOrder.notesClient ? (
              changeOrder.notesClient.includes("<") ? (
                <div
                  className="prose prose-sm mt-2 max-w-none text-[var(--bt-text)]"
                  dangerouslySetInnerHTML={{ __html: changeOrder.notesClient }}
                />
              ) : (
                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-[var(--bt-text)]">{changeOrder.notesClient}</p>
              )
            ) : (
              <p className="mt-2 text-sm italic text-[var(--bt-muted)]">No client-facing scope notes yet.</p>
            )}
            {changeOrder.notesBuilder ? (
              <div className="mt-4">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--bt-muted)]">Builder notes</h3>
                <p className="mt-1 whitespace-pre-wrap text-sm text-[var(--bt-muted)]">{changeOrder.notesBuilder}</p>
              </div>
            ) : null}
          </section>
        </>
      ) : (
        <div className="rounded-xl p-3 sm:p-6" style={{ background: "var(--bt-panel-bg-muted)" }}>
          <p className="mb-4 text-sm text-[var(--bt-muted)]">
            Preview of what the client sees. Builder notes and builder cost are never shown here. Clients approve from a signed
            link once marked sent.
          </p>
          <article
            className="mx-auto max-w-3xl rounded-lg border bg-white px-4 py-6 text-[#1a1a1a] shadow-sm sm:px-10 sm:py-10 print:shadow-none"
            style={{ borderColor: "#e5e7eb" }}
          >
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
              <p className="mt-1 text-sm text-[#6b7280]">
                {job.name}
                {jobAddress ? ` · ${jobAddress}` : ""}
              </p>
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
