import Link from "next/link";
import { notFound } from "next/navigation";

import { SetupNotice } from "@/app/admin/setup-notice";
import { EmptyState } from "@/components/shell/EmptyState";
import { PaymentCardIcon, ReceiptIcon } from "@/components/shell/icons";
import { currentAppUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { isQuickBooksInvoicePushEnabled } from "@/lib/env";
import { formatDate, formatMoney } from "@/lib/format";
import { computeDrawAmountCents } from "@/lib/invoicing/calc";
import { displayInvoiceId } from "@/lib/invoicing/display";
import { daysOverdue, effectiveInvoiceStatus, paymentTermsDisplayLabel } from "@/lib/invoicing/terms";
import { findOrgJobSummary } from "@/lib/jobs/request-job";
import { formatCompanyAddress } from "@/lib/organization/company-defaults";

import {
  CreateCreditMemoForm,
  CreateDepositForm,
  CreditMemoActions,
  DepositActions,
  type OpenInvoiceOption,
} from "./credit-deposit-panels";
import { CreateDrawScheduleForm, GenerateDrawInvoiceButton } from "./draw-panels";
import { InvoicesListClient, type InvoiceListRow } from "./invoices-list-client";

export const dynamic = "force-dynamic";

/** Buildertrend invoice status pills — green Paid, orange Pending/Sent (not Open-sky blue). */
const STATUS_STYLE: Record<string, { bg: string; text: string }> = {
  DRAFT: { bg: "#e5e7eb", text: "#374151" },
  REQUESTED: { bg: "#fff4e5", text: "#b76e00" },
  SENT: { bg: "#fff4e5", text: "#b76e00" },
  ISSUED: { bg: "#fff4e5", text: "#b76e00" },
  RECEIVED: { bg: "#fff4e5", text: "#b76e00" },
  PARTIALLY_PAID: { bg: "#fff4e5", text: "#b76e00" },
  PAID: { bg: "#e6f4ea", text: "#1e7e34" },
  APPLIED: { bg: "#e6f4ea", text: "#1e7e34" },
  VOID: { bg: "color-mix(in srgb, var(--bt-danger) 14%, transparent)", text: "var(--bt-danger)" },
  REFUNDED: { bg: "color-mix(in srgb, var(--bt-danger) 14%, transparent)", text: "var(--bt-danger)" },
};

function statusLabel(status: string): string {
  switch (status) {
    case "PAID":
    case "APPLIED":
      return "Paid";
    case "SENT":
    case "ISSUED":
    case "REQUESTED":
    case "RECEIVED":
      return "Pending/Sent";
    case "PARTIALLY_PAID":
      return "Partially paid";
    case "DRAFT":
      return "Draft";
    case "VOID":
      return "Void";
    case "REFUNDED":
      return "Refunded";
    default:
      return status.replace(/_/g, " ");
  }
}

// "schedule" isn't in this tab row — Buildertrend puts Payment Schedule behind its
// own header button instead of a tab (see the header's "Payment schedule" link
// below), but it's still reached the same way internally (?tab=schedule), so no
// link to it breaks.
const TABS = [
  { key: "invoices", label: "Invoices" },
  { key: "payments", label: "Payments" },
  { key: "credits", label: "Credit memos" },
  { key: "deposits", label: "Deposits" },
] as const;

const ALL_TAB_KEYS = [...TABS.map((tab) => tab.key), "schedule"] as const;
type TabKey = (typeof ALL_TAB_KEYS)[number];

function isTabKey(value: string | undefined): value is TabKey {
  return ALL_TAB_KEYS.some((key) => key === value);
}

function Badge({ status }: { status: string }) {
  const style = STATUS_STYLE[status] ?? STATUS_STYLE.DRAFT;
  return (
    <span
      className="inline-flex rounded px-1.5 py-0.5 text-[11px] font-semibold"
      style={{ background: style.bg, color: style.text }}
    >
      {statusLabel(status)}
    </span>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded border bg-[var(--bt-panel-bg)]" style={{ borderColor: "var(--bt-border)" }}>
      <table className="w-full min-w-max text-left text-sm">{children}</table>
    </div>
  );
}

function Head({ columns }: { columns: readonly string[] }) {
  return (
    <thead>
      <tr
        className="border-b text-xs font-semibold text-[var(--bt-muted)]"
        style={{ borderColor: "var(--bt-border)", background: "color-mix(in srgb, var(--bt-primary) 6%, var(--bt-panel-bg))" }}
      >
        {columns.map((column) => (
          <th key={column} className={`px-3 py-2.5 font-semibold sm:px-4 ${column.startsWith("~") ? "text-right" : ""}`}>
            {column.replace(/^~/, "")}
          </th>
        ))}
      </tr>
    </thead>
  );
}

/**
 * Buildertrend's equation above the invoices table: Original price − Payments =
 * Remaining. Inline density — not the former heavy summary-card stack.
 */
function ContractEquation({ contractPriceCents, paidCents }: { contractPriceCents: number; paidCents: number }) {
  const remainingCents = contractPriceCents - paidCents;
  const overpaid = remainingCents < 0;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-end gap-x-3 gap-y-2 text-[var(--bt-text)] sm:gap-x-5">
        <div>
          <div className="text-xs text-[var(--bt-muted)]">Original price</div>
          <div className="text-xl font-semibold tabular-nums">{formatMoney(contractPriceCents)}</div>
        </div>
        <span className="pb-1 text-lg text-[var(--bt-muted)]" aria-hidden>
          −
        </span>
        <div>
          <div className="text-xs text-[var(--bt-muted)]">Payments</div>
          <div className="text-xl font-semibold tabular-nums">{formatMoney(paidCents)}</div>
        </div>
        <span className="pb-1 text-lg text-[var(--bt-muted)]" aria-hidden>
          =
        </span>
        <div>
          <div className="flex items-center gap-1 text-xs text-[var(--bt-muted)]">
            Remaining balance
            <span
              title="The job's revised contract price minus every payment received so far. This is what the client still owes overall — it isn't the same as what has been invoiced yet."
              className="inline-flex h-3.5 w-3.5 cursor-help items-center justify-center rounded-full border text-[9px] leading-none"
              style={{ borderColor: "var(--bt-border)", color: "#3b82f6" }}
            >
              i
            </span>
          </div>
          <div
            className="text-xl font-semibold tabular-nums"
            style={{ color: overpaid ? "var(--bt-danger)" : "var(--bt-text)" }}
          >
            {formatMoney(remainingCents)}
          </div>
        </div>
      </div>
      {overpaid ? (
        <p className="text-xs text-[var(--bt-muted)]">
          Payments exceed the job&apos;s revised client price by {formatMoney(-remainingCents)}. Invoice billed/received
          still matches Buildertrend; the budget/proposal is understating contract (missing proposal, CO, or selection) —
          not a double-counted payment.
        </p>
      ) : null}
    </div>
  );
}

function datePaidFor(invoice: {
  paidAt: Date | null;
  payments: readonly { receivedAt: Date }[];
}): Date | null {
  if (invoice.paidAt) return invoice.paidAt;
  const latest = invoice.payments[0];
  return latest?.receivedAt ?? null;
}

export default async function InvoicesPage({ params, searchParams }: PageProps<"/jobs/[jobId]/invoices">) {
  const { jobId } = await params;
  const { tab, showVoid } = await searchParams;

  let user;
  try {
    user = await currentAppUser();
  } catch (error) {
    return <SetupNotice detail={error instanceof Error ? error.message : String(error)} />;
  }
  if (!user) {
    return <SetupNotice detail="No organization found. Seed the database, then reload." />;
  }

  const job = await findOrgJobSummary(user.organizationId, jobId);
  if (!job) notFound();

  const activeTab: TabKey = isTabKey(typeof tab === "string" ? tab : undefined) ? (tab as TabKey) : "invoices";

  const [invoices, creditMemos, deposits, drawSchedules, budgetLines, organization, clientAccess] = await Promise.all([
    db.invoice.findMany({
      where: { jobId: job.id },
      orderBy: { createdAt: "desc" },
      include: { payments: { orderBy: { receivedAt: "desc" } }, creditMemos: { where: { status: "APPLIED" } } },
    }),
    db.creditMemo.findMany({ where: { jobId: job.id }, orderBy: { createdAt: "desc" }, include: { invoice: { select: { invoiceNumber: true } } } }),
    db.deposit.findMany({ where: { jobId: job.id }, orderBy: { createdAt: "desc" }, include: { invoice: { select: { invoiceNumber: true } } } }),
    db.drawSchedule.findMany({
      where: { jobId: job.id },
      orderBy: { createdAt: "asc" },
      include: { draws: { orderBy: { sortOrder: "asc" }, include: { invoice: { select: { id: true, invoiceNumber: true, status: true } } } } },
    }),
    db.budgetLine.findMany({ where: { jobId: job.id }, select: { revisedClientPriceCents: true } }),
    db.organization.findFirst({
      where: { id: user.organizationId },
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
    }),
    db.clientJobAccess.findFirst({
      where: { jobId: job.id },
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
    }),
  ]);

  const contractPriceCents = budgetLines.reduce((total, line) => total + line.revisedClientPriceCents, 0);
  const now = new Date();

  const live = invoices.filter((invoice) => invoice.status !== "VOID");
  const voided = invoices.filter((invoice) => invoice.status === "VOID");
  // Migration left prefix-duplicate VOID rows (J*-INV-* vs JOB_*). Footer totals
  // already ignored them; the table still listed them and looked like double billing.
  const showVoided = showVoid === "1" || showVoid === "true";
  const invoicesForTable = showVoided ? invoices : live;
  const billedCents = live.reduce((total, invoice) => total + invoice.amountCents, 0);
  const paidCents = live.reduce(
    (total, invoice) => total + invoice.payments.reduce((sum, payment) => sum + payment.amountCents, 0),
    0,
  );
  const creditedCents = live.reduce(
    (total, invoice) => total + invoice.creditMemos.reduce((sum, memo) => sum + memo.amountCents, 0),
    0,
  );

  // Only invoices that still owe something are worth applying a credit or deposit to.
  const openInvoices: OpenInvoiceOption[] = live
    .filter((invoice) => {
      const settled =
        invoice.payments.reduce((sum, payment) => sum + payment.amountCents, 0) +
        invoice.creditMemos.reduce((sum, memo) => sum + memo.amountCents, 0);
      return invoice.status !== "DRAFT" && invoice.amountCents - settled > 0;
    })
    .map((invoice) => ({ id: invoice.id, label: `${invoice.invoiceNumber} — ${formatMoney(invoice.amountCents)}` }));

  // Payments on VOID prefix-duplicates are migration leftovers — exclude from the
  // Payments tab so cash-in doesn't look double-counted against live invoices.
  const allPayments = live
    .flatMap((invoice) => invoice.payments.map((payment) => ({ payment, invoice })))
    .sort((a, b) => b.payment.receivedAt.getTime() - a.payment.receivedAt.getTime());

  const client = clientAccess?.client;
  const clientAddress = client
    ? formatCompanyAddress({
        addressLine1: client.addressLine1,
        city: client.city,
        state: client.state,
        postalCode: client.postalCode,
      })
    : null;

  const invoiceRows: InvoiceListRow[] = invoicesForTable.map((invoice) => {
    const paid = invoice.payments.reduce((sum, payment) => sum + payment.amountCents, 0);
    const credited = invoice.creditMemos.reduce((sum, memo) => sum + memo.amountCents, 0);
    const balance = invoice.amountCents - paid - credited;
    const displayStatus = effectiveInvoiceStatus(invoice.status, invoice.amountCents, paid);
    const termsLabel = paymentTermsDisplayLabel(invoice.paymentTerms);
    const late = displayStatus !== "PAID" && displayStatus !== "DRAFT" && daysOverdue(invoice.dueOn, now);
    const paidOn = displayStatus === "PAID" || paid > 0 ? datePaidFor(invoice) : null;
    const displayId = displayInvoiceId(invoice.invoiceNumber);
    return {
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      displayId,
      title: invoice.title,
      displayStatus,
      termsLabel,
      totalLabel: formatMoney(invoice.amountCents),
      paidLabel: formatMoney(paid),
      balanceLabel: formatMoney(balance),
      balanceCents: balance,
      datePaidLabel: formatDate(paidOn),
      datePaidIso: paidOn ? paidOn.toISOString() : null,
      lateDays: late || null,
      searchText: `${displayId} ${invoice.invoiceNumber} ${invoice.title ?? ""} ${displayStatus}`.toLowerCase(),
    };
  });

  const tabs = (
    <nav className="flex flex-wrap gap-1 border-b" style={{ borderColor: "var(--bt-border)" }}>
      {TABS.map((entry) => {
        const isActive = entry.key === activeTab;
        return (
          <Link
            key={entry.key}
            href={`/jobs/${job.id}/invoices?tab=${entry.key}`}
            className="-mb-px border-b-2 px-3 py-2 text-sm font-medium transition"
            style={{
              borderColor: isActive ? "var(--bt-primary)" : "transparent",
              color: isActive ? "var(--bt-primary)" : "var(--bt-muted)",
            }}
          >
            {entry.label}
          </Link>
        );
      })}
    </nav>
  );

  const voidedNotice =
    activeTab === "invoices" && voided.length > 0 ? (
      <p className="text-sm text-[var(--bt-muted)]">
        {showVoided ? (
          <>
            Showing {voided.length} voided invoice{voided.length === 1 ? "" : "s"} (prefix duplicates from migration).{" "}
            <Link href={`/jobs/${job.id}/invoices`} className="font-semibold text-[var(--bt-primary)] hover:underline">
              Hide voided
            </Link>
          </>
        ) : (
          <>
            Hiding {voided.length} voided invoice{voided.length === 1 ? "" : "s"} (not in billed/paid totals).{" "}
            <Link href={`/jobs/${job.id}/invoices?showVoid=1`} className="font-semibold text-[var(--bt-primary)] hover:underline">
              Show voided
            </Link>
          </>
        )}
      </p>
    ) : null;

  const otherTabContent = (
    <>
      {activeTab === "schedule" ? (
        <>
          {drawSchedules.length === 0 ? (
            <>
              <p className="text-sm text-[var(--bt-muted)]">
                A draw schedule bills the contract in milestones instead of one invoice. Percentages are of the job&apos;s
                current revised client price, {formatMoney(contractPriceCents)}.
              </p>
              <CreateDrawScheduleForm jobId={job.id} />
            </>
          ) : (
            drawSchedules.map((schedule) => {
              const allocated = schedule.draws.reduce((total, draw) => total + draw.pctOfContractBasisPoints, 0);
              return (
                <div key={schedule.id} className="flex flex-col gap-2">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h2 className="text-sm font-semibold text-[var(--bt-text)]">{schedule.name}</h2>
                    <span className="text-xs text-[var(--bt-muted)]">
                      {(allocated / 100).toFixed(2)}% of {formatMoney(contractPriceCents)} allocated
                    </span>
                  </div>
                  <Panel>
                    <Head columns={["Draw", "~% of contract", "~Amount", "Bill on", "Invoice", "Actions"]} />
                    <tbody>
                      {schedule.draws.map((draw) => (
                        <tr key={draw.id} className="border-b align-top last:border-0" style={{ borderColor: "var(--bt-border)" }}>
                          <td className="px-4 py-3 text-[var(--bt-text)]">{draw.title}</td>
                          <td className="px-4 py-3 text-right text-[var(--bt-muted)]">
                            {(draw.pctOfContractBasisPoints / 100).toFixed(2)}%
                          </td>
                          <td className="px-4 py-3 text-right text-[var(--bt-text)]">
                            {formatMoney(computeDrawAmountCents(contractPriceCents, draw.pctOfContractBasisPoints))}
                          </td>
                          <td className="px-4 py-3 text-[var(--bt-muted)]">{formatDate(draw.autoGeneratesInvoiceOnDate)}</td>
                          <td className="px-4 py-3">
                            {draw.invoice ? (
                              <Link href={`/jobs/${job.id}/invoices/${draw.invoice.id}`} className="text-[var(--bt-primary)] hover:underline">
                                {draw.invoice.invoiceNumber}
                              </Link>
                            ) : (
                              <span className="text-[var(--bt-muted)]">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {draw.invoice ? null : <GenerateDrawInvoiceButton jobId={job.id} drawId={draw.id} />}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </Panel>
                </div>
              );
            })
          )}
        </>
      ) : null}

      {activeTab === "payments" ? (
        allPayments.length === 0 ? (
          <EmptyState
            icon={<PaymentCardIcon className="h-10 w-10" />}
            title="No payments yet"
            description="Payments recorded against this job's invoices show up here."
          />
        ) : (
          <Panel>
            <Head columns={["Invoice", "Date paid", "Recorded by", "~Payment amount"]} />
            <tbody>
              {allPayments.map(({ payment, invoice }) => {
                const recordedBy =
                  payment.method === "QBO_SYNC"
                    ? "QuickBooks"
                    : payment.method === "STRIPE_CARD" || payment.method === "STRIPE_ACH"
                      ? "Client portal"
                      : "Staff";
                return (
                  <tr key={payment.id} className="border-b last:border-0" style={{ borderColor: "var(--bt-border)" }}>
                    <td className="px-4 py-3">
                      <Link href={`/jobs/${job.id}/invoices/${invoice.id}`} className="font-medium text-[var(--bt-primary)] hover:underline">
                        {invoice.invoiceNumber}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-[var(--bt-muted)]">{formatDate(payment.receivedAt)}</td>
                    <td className="px-4 py-3 text-[var(--bt-muted)]">{recordedBy}</td>
                    <td className="px-4 py-3 text-right text-[var(--bt-text)]">{formatMoney(payment.amountCents)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t font-semibold" style={{ borderColor: "var(--bt-border)" }}>
                <td className="px-4 py-3" colSpan={3}>
                  Totals
                </td>
                <td className="px-4 py-3 text-right text-[var(--bt-text)]">
                  {formatMoney(allPayments.reduce((sum, row) => sum + row.payment.amountCents, 0))}
                </td>
              </tr>
            </tfoot>
          </Panel>
        )
      ) : null}

      {activeTab === "credits" ? (
        <>
          <CreateCreditMemoForm
            jobId={job.id}
            suggestedNumber={`CM-${String(creditMemos.length + 1).padStart(4, "0")}`}
            invoices={openInvoices}
          />
          {creditMemos.length === 0 ? (
            <EmptyState
              icon={<ReceiptIcon className="h-10 w-10" />}
              title="No credit memos"
              description="A credit memo reduces what a client owes without editing an invoice that already went out."
            />
          ) : (
            <Panel>
              <Head columns={["Memo #", "Status", "Reason", "Applied to", "~Amount", "Actions"]} />
              <tbody>
                {creditMemos.map((memo) => (
                  <tr key={memo.id} className="border-b align-top last:border-0" style={{ borderColor: "var(--bt-border)" }}>
                    <td className="px-4 py-3 font-medium text-[var(--bt-text)]">{memo.memoNumber}</td>
                    <td className="px-4 py-3">
                      <Badge status={memo.status} />
                    </td>
                    <td className="px-4 py-3 text-[var(--bt-muted)]">{memo.reason ?? "—"}</td>
                    <td className="px-4 py-3 text-[var(--bt-muted)]">{memo.invoice?.invoiceNumber ?? "—"}</td>
                    <td className="px-4 py-3 text-right text-[var(--bt-text)]">{formatMoney(memo.amountCents)}</td>
                    <td className="px-4 py-3">
                      <CreditMemoActions jobId={job.id} creditMemoId={memo.id} status={memo.status} invoices={openInvoices} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </Panel>
          )}
        </>
      ) : null}

      {activeTab === "deposits" ? (
        <>
          <CreateDepositForm jobId={job.id} />
          {deposits.length === 0 ? (
            <EmptyState
              icon={<PaymentCardIcon className="h-10 w-10" />}
              title="No deposits"
              description="Money taken before there is an invoice to put it against — a signing deposit, a selections deposit."
            />
          ) : (
            <Panel>
              <Head columns={["Deposit", "Status", "Received", "Reference", "Applied to", "~Amount", "Actions"]} />
              <tbody>
                {deposits.map((deposit) => (
                  <tr key={deposit.id} className="border-b align-top last:border-0" style={{ borderColor: "var(--bt-border)" }}>
                    <td className="px-4 py-3 font-medium text-[var(--bt-text)]">{deposit.title}</td>
                    <td className="px-4 py-3">
                      <Badge status={deposit.status} />
                    </td>
                    <td className="px-4 py-3 text-[var(--bt-muted)]">{formatDate(deposit.receivedAt)}</td>
                    <td className="px-4 py-3 text-[var(--bt-muted)]">{deposit.reference ?? "—"}</td>
                    <td className="px-4 py-3 text-[var(--bt-muted)]">{deposit.invoice?.invoiceNumber ?? "—"}</td>
                    <td className="px-4 py-3 text-right text-[var(--bt-text)]">{formatMoney(deposit.amountCents)}</td>
                    <td className="px-4 py-3">
                      <DepositActions jobId={job.id} depositId={deposit.id} status={deposit.status} invoices={openInvoices} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </Panel>
          )}
        </>
      ) : null}
    </>
  );

  return (
    <InvoicesListClient
      jobId={job.id}
      jobName={job.name}
      scheduleActive={activeTab === "schedule"}
      branding={{
        organizationName: organization?.name ?? "World Construction Inc",
        organizationLogoPath: organization?.logoPath ?? null,
        orgAddressLine1: organization?.addressLine1 ?? null,
        orgCity: organization?.city ?? null,
        orgState: organization?.state ?? null,
        orgPostalCode: organization?.postalCode ?? null,
        orgPhone: organization?.contactPhone ?? null,
        orgSlogan: organization?.slogan ?? null,
        clientName: client?.name ?? null,
        clientAddress,
        jobAddress: null,
        qboInvoicePushEnabled: isQuickBooksInvoicePushEnabled(),
      }}
      rows={invoiceRows}
      totals={{
        totalLabel: formatMoney(billedCents),
        paidLabel: formatMoney(paidCents),
        balanceLabel: formatMoney(billedCents - paidCents - creditedCents),
      }}
      voidedNotice={voidedNotice}
      emptyTitle={live.length === 0 && voided.length === 0 ? "No invoices yet" : "No active invoices"}
      emptyDescription={
        live.length === 0 && voided.length === 0
          ? "Use + Invoice above to create a draft, or set up a payment schedule."
          : "All invoices on this job are voided. Show voided to review migration duplicates."
      }
      tabs={tabs}
      contractEquation={<ContractEquation contractPriceCents={contractPriceCents} paidCents={paidCents} />}
      otherTabContent={otherTabContent}
      activeIsInvoices={activeTab === "invoices"}
      showEquation={activeTab === "invoices" || activeTab === "payments" || activeTab === "credits" || activeTab === "deposits"}
    />
  );
}
