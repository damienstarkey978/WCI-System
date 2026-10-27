import { notFound } from "next/navigation";

import { extendedCostCents } from "@/lib/budget/funnel";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/format";
import { currentVendorPortalSession } from "@/lib/vendor-portal/browser-session";

import { AcceptPurchaseOrderForm } from "./accept-form";

export const dynamic = "force-dynamic";

/**
 * Headless vendor e-sign page for a PO — opened from the emailed Send link
 * (`?token=…`) or while signed into the vendor portal.
 */
export default async function VendorAcceptPurchaseOrderPage({
  params,
  searchParams,
}: PageProps<"/vendor-portal/purchase-orders/[purchaseOrderId]/accept">) {
  const { purchaseOrderId } = await params;
  const query = await searchParams;
  const token = typeof query.token === "string" ? query.token : null;

  const purchaseOrder = await db.purchaseOrder.findFirst({
    where: { id: purchaseOrderId },
    include: {
      job: { select: { name: true, addressLine1: true, city: true, state: true } },
      organization: { select: { name: true } },
      vendor: { select: { name: true, primaryContact: true } },
      lineItems: {
        orderBy: { sortOrder: "asc" },
        include: { costCode: { select: { code: true, name: true } } },
      },
    },
  });
  if (!purchaseOrder) notFound();

  const session = await currentVendorPortalSession();
  const canViewViaSession = session && session.vendorId === purchaseOrder.vendorId;
  if (!token && !canViewViaSession) {
    return (
      <div className="mx-auto max-w-lg p-6">
        <h1 className="text-lg font-semibold text-[var(--bt-text)]">Purchase order</h1>
        <p className="mt-2 text-sm text-[var(--bt-muted)]">
          Open the acceptance link from your email, or sign in to the vendor portal first.
        </p>
      </div>
    );
  }

  const totalCents = purchaseOrder.lineItems.reduce(
    (sum, item) => sum + extendedCostCents(item.quantityMilli, item.unitCostCents),
    0,
  );
  const alreadyAccepted = Boolean(purchaseOrder.vendorSignedAt) || purchaseOrder.status === "APPROVED";
  const defaultName = purchaseOrder.vendor?.primaryContact ?? purchaseOrder.vendor?.name ?? "";

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 p-4 sm:p-6">
      <div>
        <div className="text-xs text-[var(--bt-muted)]">{purchaseOrder.organization.name}</div>
        <h1 className="mt-1 text-xl font-semibold text-[var(--bt-text)]">
          PO {purchaseOrder.poNumber}
          {purchaseOrder.title ? ` — ${purchaseOrder.title}` : ""}
        </h1>
        <p className="mt-1 text-sm text-[var(--bt-muted)]">
          {purchaseOrder.job.name}
          {purchaseOrder.job.addressLine1
            ? ` · ${[purchaseOrder.job.addressLine1, purchaseOrder.job.city, purchaseOrder.job.state].filter(Boolean).join(", ")}`
            : ""}
        </p>
      </div>

      {purchaseOrder.scopeOfWork ? (
        <section className="rounded-lg border bg-[var(--bt-panel-bg)] p-4" style={{ borderColor: "var(--bt-border)" }}>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--bt-muted)]">Scope of work</h2>
          <div className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-[var(--bt-text)]">{purchaseOrder.scopeOfWork}</div>
        </section>
      ) : null}

      <section className="rounded-lg border bg-[var(--bt-panel-bg)] p-4" style={{ borderColor: "var(--bt-border)" }}>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--bt-muted)]">Cost</h2>
        <table className="mt-2 w-full text-left text-sm">
          <thead>
            <tr className="text-xs text-[var(--bt-muted)]">
              <th className="py-1 font-medium">Item</th>
              <th className="py-1 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody>
            {purchaseOrder.lineItems.map((item) => (
              <tr key={item.id} className="border-t" style={{ borderColor: "var(--bt-border)" }}>
                <td className="py-2 text-[var(--bt-text)]">
                  {item.title}
                  <div className="text-xs text-[var(--bt-muted)]">
                    {item.costCode.code} {item.costCode.name}
                  </div>
                </td>
                <td className="py-2 text-right tabular-nums text-[var(--bt-text)]">
                  {formatMoney(extendedCostCents(item.quantityMilli, item.unitCostCents))}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t font-semibold" style={{ borderColor: "var(--bt-border)" }}>
              <td className="py-2">Total</td>
              <td className="py-2 text-right tabular-nums">{formatMoney(totalCents)}</td>
            </tr>
          </tfoot>
        </table>
      </section>

      {alreadyAccepted && purchaseOrder.vendorSignedAt ? (
        <div className="rounded-lg border p-4" style={{ borderColor: "var(--bt-border)", background: "var(--bt-status-open-bg)" }}>
          <p className="text-sm font-semibold" style={{ color: "var(--bt-status-open-text)" }}>
            Already accepted by {purchaseOrder.vendorSignatureName ?? "vendor"}.
          </p>
        </div>
      ) : (
        <AcceptPurchaseOrderForm
          purchaseOrderId={purchaseOrder.id}
          token={token}
          defaultName={defaultName}
        />
      )}
    </div>
  );
}
