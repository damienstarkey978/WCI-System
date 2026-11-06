import { notFound } from "next/navigation";

import { SetupNotice } from "@/app/admin/setup-notice";
import { CommentThread } from "@/components/comments/CommentThread";
import { currentAppUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { isQuickBooksInvoicePushEnabled } from "@/lib/env";
import { formatDate, formatMoney } from "@/lib/format";
import { changeOrderLineClientPriceCents } from "@/lib/invoicing/from-change-orders";
import { effectiveInvoiceStatus, paymentTermsDisplayLabel } from "@/lib/invoicing/terms";
import { formatBasisPoints } from "@/lib/money";
import { formatCompanyAddress } from "@/lib/organization/company-defaults";

import type { ChangeOrderAddFromRow } from "./add-from-change-orders-modal";
import { InvoiceDetailView } from "./invoice-detail-view";

export const dynamic = "force-dynamic";

const METHOD_LABEL: Record<string, string> = {
  STRIPE_CARD: "Card (online)",
  STRIPE_ACH: "ACH (online)",
  QBO_SYNC: "QuickBooks",
  MANUAL: "Manual",
};

const COST_TYPE_LABEL: Record<string, string> = {
  NONE: "None",
  LABOR: "Labor",
  MATERIAL: "Material",
  EQUIPMENT: "Equipment",
  SUBCONTRACTOR: "Subcontractor",
  OTHER: "Other",
};

function dateInputValue(value: Date | null | undefined): string {
  if (!value) return "";
  return value.toISOString().slice(0, 10);
}

export default async function InvoiceDetailPage({
  params,
  searchParams,
}: PageProps<"/jobs/[jobId]/invoices/[invoiceId]">) {
  const { jobId, invoiceId } = await params;
  const { tab: tabParam } = await searchParams;
  const initialTab = tabParam === "preview" ? "preview" : "details";

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
      organization: {
        select: {
          name: true,
          logoPath: true,
          addressLine1: true,
          city: true,
          state: true,
          postalCode: true,
          contactPhone: true,
          slogan: true,
        },
      },
      clientAccess: {
        take: 1,
        include: {
          client: {
            select: {
              name: true,
              addressLine1: true,
              city: true,
              state: true,
              postalCode: true,
            },
          },
        },
      },
    },
  });
  if (!job) notFound();

  const invoice = await db.invoice.findFirst({
    where: { id: invoiceId, jobId: job.id, organizationId: user.organizationId },
    include: {
      lineItems: { orderBy: { sortOrder: "asc" }, include: { costCode: { select: { code: true, name: true } } } },
      payments: { orderBy: { receivedAt: "desc" } },
      creditMemos: { orderBy: { createdAt: "desc" } },
      deposits: { orderBy: { createdAt: "desc" } },
      draw: { select: { title: true } },
    },
  });
  if (!invoice) notFound();

  const qboConnection = await db.quickBooksConnection.findUnique({ where: { organizationId: user.organizationId } });
  const isQboConnected = Boolean(qboConnection && !qboConnection.disconnectedAt);
  const qboInvoicePushEnabled = isQuickBooksInvoicePushEnabled();

  const paidCents = invoice.payments.reduce((sum, payment) => sum + payment.amountCents, 0);
  const displayStatus = effectiveInvoiceStatus(invoice.status, invoice.amountCents, paidCents);
  const termsLabel = paymentTermsDisplayLabel(invoice.paymentTerms) ?? "";
  const creditedCents = invoice.creditMemos
    .filter((memo) => memo.status === "APPLIED")
    .reduce((sum, memo) => sum + memo.amountCents, 0);
  const subtotalCents = invoice.amountCents - invoice.taxCents;
  const balanceCents = invoice.amountCents - paidCents - creditedCents;
  const canAct = displayStatus !== "VOID" && displayStatus !== "PAID";
  const canEdit = invoice.status === "DRAFT";
  const hasOnlinePayment = invoice.payments.some((p) => p.method === "STRIPE_CARD" || p.method === "STRIPE_ACH");
  const hasQboPayment = invoice.payments.some((p) => p.method === "QBO_SYNC");

  const approvedChangeOrders = canEdit
    ? await db.changeOrder.findMany({
        where: { jobId: job.id, organizationId: user.organizationId, status: "APPROVED" },
        orderBy: { number: "asc" },
        include: {
          lineItems: {
            orderBy: { sortOrder: "asc" },
            include: {
              costCode: { select: { code: true, name: true } },
              invoiceLines: {
                where: { invoice: { status: { not: "VOID" } } },
                select: { amountCents: true },
              },
            },
          },
          invoiceLines: {
            where: { invoice: { status: { not: "VOID" } } },
            select: { amountCents: true },
          },
        },
      })
    : [];

  const changeOrderRows: ChangeOrderAddFromRow[] = [];
  for (const co of approvedChangeOrders) {
    const groupLabel = `CO ${String(co.number).padStart(4, "0")} — ${co.title}`;
    if (co.mode === "FLAT") {
      const clientPriceCents = co.flatClientPriceCents ?? 0;
      if (clientPriceCents <= 0) continue;
      const alreadyInvoicedCents = co.invoiceLines.reduce((sum, row) => sum + row.amountCents, 0);
      const remainingCents = Math.max(0, clientPriceCents - alreadyInvoicedCents);
      if (remainingCents <= 0) continue;
      changeOrderRows.push({
        sourceKey: `flat:${co.id}`,
        groupLabel,
        title: co.title,
        costCodeLabel: "",
        costTypeLabel: "Flat",
        clientPriceCents,
        alreadyInvoicedCents,
        remainingPercent: Math.round((remainingCents / clientPriceCents) * 1000) / 10,
      });
      continue;
    }
    for (const line of co.lineItems) {
      const clientPriceCents = changeOrderLineClientPriceCents(line);
      if (clientPriceCents <= 0) continue;
      const alreadyInvoicedCents = line.invoiceLines.reduce((sum, row) => sum + row.amountCents, 0);
      const remainingCents = Math.max(0, clientPriceCents - alreadyInvoicedCents);
      if (remainingCents <= 0) continue;
      changeOrderRows.push({
        sourceKey: line.id,
        groupLabel,
        title: line.title,
        costCodeLabel: `${line.costCode.code} ${line.costCode.name}`,
        costTypeLabel: COST_TYPE_LABEL[line.costType] ?? line.costType,
        clientPriceCents,
        alreadyInvoicedCents,
        remainingPercent: Math.round((remainingCents / clientPriceCents) * 1000) / 10,
      });
    }
  }

  const client = job.clientAccess[0]?.client ?? null;
  const clientAddress = client
    ? formatCompanyAddress({
        addressLine1: client.addressLine1,
        city: client.city,
        state: client.state,
        postalCode: client.postalCode,
      })
    : null;
  const jobAddress = [job.addressLine1, job.city, job.state].filter(Boolean).join(", ") || null;

  const taxLabel =
    invoice.taxCents > 0 || invoice.taxRateBasisPoints > 0
      ? `Sales tax (${formatBasisPoints(invoice.taxRateBasisPoints)})`
      : "No Tax";

  const sentByLabel = invoice.lastSentAt
    ? `Sent${invoice.sendCount > 1 ? ` (${invoice.sendCount}×)` : ""} on ${formatDate(invoice.lastSentAt)}`
    : null;

  return (
    <InvoiceDetailView
      jobId={job.id}
      jobName={job.name}
      jobAddress={jobAddress}
      invoiceId={invoice.id}
      organizationName={job.organization.name}
      organizationLogoPath={job.organization.logoPath}
      orgAddressLine1={job.organization.addressLine1}
      orgCity={job.organization.city}
      orgState={job.organization.state}
      orgPostalCode={job.organization.postalCode}
      orgPhone={job.organization.contactPhone}
      orgSlogan={job.organization.slogan}
      clientName={client?.name ?? null}
      clientAddress={clientAddress}
      invoiceNumber={invoice.invoiceNumber}
      title={invoice.title ?? invoice.draw?.title ?? null}
      displayStatus={displayStatus}
      termsLabel={termsLabel}
      issuedOnLabel={formatDate(invoice.issuedOn)}
      dueOnLabel={formatDate(invoice.dueOn)}
      paidAtLabel={formatDate(invoice.paidAt)}
      lastSentAtLabel={formatDate(invoice.lastSentAt)}
      sentByLabel={sentByLabel}
      clientViewedLabel={invoice.clientLastViewedAt ? formatDate(invoice.clientLastViewedAt) : "Never"}
      taxLabel={taxLabel}
      subtotalLabel={formatMoney(subtotalCents)}
      taxAmountLabel={formatMoney(invoice.taxCents)}
      totalLabel={formatMoney(invoice.amountCents)}
      paidLabel={formatMoney(paidCents)}
      creditedLabel={creditedCents > 0 ? formatMoney(creditedCents) : null}
      balanceLabel={formatMoney(balanceCents)}
      clientMessage={invoice.clientMessage}
      lines={invoice.lineItems.map((item) => ({
        id: item.id,
        title: item.title,
        description: item.description,
        costCodeLabel: item.costCode ? `${item.costCode.code} ${item.costCode.name}` : null,
        qtyLabel: item.quantityMilli === null ? "—" : (item.quantityMilli / 1000).toString(),
        unitCostLabel: item.unitCostCents === null ? "—" : formatMoney(item.unitCostCents),
        markupLabel:
          item.rateBasisPoints === null
            ? "—"
            : `${formatBasisPoints(item.rateBasisPoints)} ${item.rateMode === "MARGIN" ? "margin" : "markup"}`,
        taxable: item.taxable,
        amountLabel: formatMoney(item.amountCents),
      }))}
      payments={invoice.payments.map((payment) => ({
        id: payment.id,
        methodLabel: METHOD_LABEL[payment.method] ?? payment.method,
        reference: payment.reference,
        receivedAtLabel: formatDate(payment.receivedAt),
        amountLabel: formatMoney(payment.amountCents),
      }))}
      creditsAndDeposits={[
        ...invoice.creditMemos.map((memo) => ({
          id: memo.id,
          kind: "credit" as const,
          label: `Credit ${memo.memoNumber}`,
          detail: `${memo.status.replace(/_/g, " ")}${memo.reason ? ` — ${memo.reason}` : ""}`,
          amountLabel: `−${formatMoney(memo.amountCents)}`,
        })),
        ...invoice.deposits.map((deposit) => ({
          id: deposit.id,
          kind: "deposit" as const,
          label: `Deposit — ${deposit.title}`,
          detail: deposit.status.replace(/_/g, " "),
          amountLabel: formatMoney(deposit.amountCents),
        })),
      ]}
      canAct={canAct}
      canEdit={canEdit}
      paymentTerms={invoice.paymentTerms}
      issuedOnValue={dateInputValue(invoice.issuedOn)}
      dueOnValue={dateInputValue(invoice.dueOn)}
      amountValue={
        invoice.type === "FLAT" && invoice.lineItems.length === 0
          ? (invoice.amountCents / 100).toFixed(2)
          : null
      }
      invoiceType={invoice.type}
      changeOrderRows={changeOrderRows}
      isQboConnected={isQboConnected}
      qboInvoicePushEnabled={qboInvoicePushEnabled}
      qboInvoiceId={invoice.qboInvoiceId}
      hasQboPayment={hasQboPayment}
      hasOnlinePayment={hasOnlinePayment}
      initialTab={initialTab}
      comments={
        <CommentThread
          organizationId={user.organizationId}
          featureType="Invoice"
          featureId={invoice.id}
          revalidate={`/jobs/${job.id}/invoices/${invoice.id}`}
        />
      }
    />
  );
}
