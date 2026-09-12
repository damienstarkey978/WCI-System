import Link from "next/link";
import { notFound } from "next/navigation";

import { SetupNotice } from "@/app/admin/setup-notice";
import { EmptyState } from "@/components/shell/EmptyState";
import { currentAppUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate, formatMoney } from "@/lib/format";
import { computeDrawAmountCents } from "@/lib/invoicing/calc";
import { PAYMENT_TERMS_LABELS, daysOverdue } from "@/lib/invoicing/terms";

import { CreateInvoiceForm } from "./create-invoice-form";
import {
  CreateCreditMemoForm,
  CreateDepositForm,
  CreditMemoActions,
  DepositActions,
  type OpenInvoiceOption,
} from "./credit-deposit-panels";
import { CreateDrawScheduleForm, GenerateDrawInvoiceButton } from "./draw-panels";
import { RecordPaymentForm } from "./record-payment-form";
import { VoidInvoiceButton } from "./void-invoice-button";

export const dynamic = "force-dynamic";

const STATUS_STYLE: Record<string, { bg: string; text: string }> = {
  DRAFT: { bg: "#e5e7eb", text: "#374151" },
  REQUESTED: { bg: "#e5e7eb", text: "#374151" },
  SENT: { bg: "color-mix(in srgb, var(--bt-primary) 14%, transparent)", text: "var(--bt-primary)" },
  ISSUED: { bg: "color-mix(in srgb, var(--bt-primary) 14%, transparent)", text: "var(--bt-primary)" },
  RECEIVED: { bg: "color-mix(in srgb, var(--bt-primary) 14%, transparent)", text: "var(--bt-primary)" },
  PARTIALLY_PAID: { bg: "color-mix(in srgb, var(--bt-hazard) 14%, transparent)", text: "var(--bt-hazard)" },
  PAID: { bg: "var(--bt-status-open-bg)", text: "var(--bt-status-open-text)" },
  APPLIED: { bg: "var(--bt-status-open-bg)", text: "var(--bt-status-open-text)" },
  VOID: { bg: "color-mix(in srgb, var(--bt-danger) 14%, transparent)", text: "var(--bt-danger)" },
  REFUNDED: { bg: "color-mix(in srgb, var(--bt-danger) 14%, transparent)", text: "var(--bt-danger)" },
};

const TABS = [
  { key: "invoices", label: "Invoices" },
  { key: "schedule", label: "Payment schedule" },
  { key: "payments", label: "Payments" },
  { key: "credits", label: "Credit memos" },
  { key: "deposits", label: "Deposits" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

function isTabKey(value: string | undefined): value is TabKey {
  return TABS.some((tab) => tab.key === value);
}

function Badge({ status }: { status: string }) {
  const style = STATUS_STYLE[status] ?? STATUS_STYLE.DRAFT;
  return (
    <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: style.bg, color: style.text }}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-lg border bg-[var(--bt-panel-bg)]" style={{ borderColor: "var(--bt-border)" }}>
      <table className="w-full min-w-max text-left text-sm">{children}</table>
    </div>
  );
}

function Head({ columns }: { columns: readonly string[] }) {
  return (
    <thead>
      <tr
        className="border-b text-xs font-semibold uppercase tracking-wide text-[var(--bt-muted)]"
        style={{ borderColor: "var(--bt-border)" }}
      >
        {columns.map((column) => (
          <th key={column} className={`px-4 py-3 ${column.startsWith("~") ? "text-right" : ""}`}>
            {column.replace(/^~/, "")}
          </th>
        ))}
      </tr>
    </thead>
  );
}

/**
 * The Buildertrend-style equation at the top of a job's Invoices screen: the
 * contract's Original price minus Payments received equals the Remaining balance —
 * a different number from the "Outstanding" tile below, which is only what has
 * actually been invoiced so far and may be less than the full contract.
 */
function ContractEquation({ contractPriceCents, paidCents }: { contractPriceCents: number; paidCents: number }) {
  const remainingCents = contractPriceCents - paidCents;
  return (
    <div
      className="flex flex-wrap items-center gap-4 rounded-lg border bg-[var(--bt-panel-bg)] px-4 py-3 sm:gap-6"
      style={{ borderColor: "var(--bt-border)" }}
    >
      <div>
        <div className="text-xs font-semibold uppercase tracking-wide text-[var(--bt-muted)]">Original price</div>
        <div className="mt-1 text-lg font-semibold text-[var(--bt-text)]">{formatMoney(contractPriceCents)}</div>
      </div>
      <span className="text-lg text-[var(--bt-muted)]">−</span>
      <div>
        <div className="text-xs font-semibold uppercase tracking-wide text-[var(--bt-muted)]">Payments</div>
        <div className="mt-1 text-lg font-semibold text-[var(--bt-text)]">{formatMoney(paidCents)}</div>
      </div>
      <span className="text-lg text-[var(--bt-muted)]">=</span>
      <div>
        <div className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-[var(--bt-muted)]">
          Remaining balance
          <span
            title="The job's revised contract price minus every payment received so far. This is what the client still owes overall — it isn't the same as what has been invoiced yet, below."
            className="cursor-help rounded-full border text-[10px] leading-3"
            style={{ borderColor: "var(--bt-border)", width: "14px", height: "14px", display: "inline-flex", alignItems: "center", justifyContent: "center" }}
          >
            i
          </span>
        </div>
        <div className="mt-1 text-lg font-semibold text-[var(--bt-text)]">{formatMoney(remainingCents)}</div>
      </div>
    </div>
  );
}

/**
 * What the office needs to know about invoices billed so far on this job: how much
 * has been billed, how much came in against those invoices, what's still owed, and
 * how much of that is late. Overdue is called out separately from outstanding
 * because they prompt different actions — one is waiting, the other is chasing.
 */
function SummaryStrip({
  billedCents,
  paidCents,
  creditedCents,
  overdueCents,
  unappliedDepositCents,
}: {
  billedCents: number;
  paidCents: number;
  creditedCents: number;
  overdueCents: number;
  unappliedDepositCents: number;
}) {
  const outstanding = billedCents - paidCents - creditedCents;
  const tiles = [
    { label: "Billed", value: formatMoney(billedCents) },
    { label: "Received", value: formatMoney(paidCents) },
    { label: "Outstanding", value: formatMoney(outstanding) },
    { label: "Overdue", value: formatMoney(overdueCents), danger: overdueCents > 0 },
    { label: "Deposits held", value: formatMoney(unappliedDepositCents) },
  ];

  return (
    <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
      {tiles.map((tile) => (
        <div key={tile.label} className="rounded-lg border bg-[var(--bt-panel-bg)] px-3 py-2" style={{ borderColor: "var(--bt-border)" }}>
          <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--bt-muted)]">{tile.label}</div>
          <div className="mt-0.5 text-sm font-semibold" style={{ color: tile.danger ? "var(--bt-danger)" : "var(--bt-text)" }}>
            {tile.value}
          </div>
        </div>
      ))}
    </div>
  );
}

export default async function InvoicesPage({ params, searchParams }: PageProps<"/jobs/[jobId]/invoices">) {
  const { jobId } = await params;
  const { tab } = await searchParams;

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

  const activeTab: TabKey = isTabKey(typeof tab === "string" ? tab : undefined) ? (tab as TabKey) : "invoices";

  const [invoices, creditMemos, deposits, drawSchedules, budgetLines] = await Promise.all([
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
  ]);

  const contractPriceCents = budgetLines.reduce((total, line) => total + line.revisedClientPriceCents, 0);
  const now = new Date();

  const live = invoices.filter((invoice) => invoice.status !== "VOID");
  const billedCents = live.reduce((total, invoice) => total + invoice.amountCents, 0);
  const paidCents = live.reduce(
    (total, invoice) => total + invoice.payments.reduce((sum, payment) => sum + payment.amountCents, 0),
    0,
  );
  const creditedCents = live.reduce(
    (total, invoice) => total + invoice.creditMemos.reduce((sum, memo) => sum + memo.amountCents, 0),
    0,
  );
  const overdueCents = live.reduce((total, invoice) => {
    if (invoice.status === "PAID" || invoice.status === "DRAFT") return total;
    if (daysOverdue(invoice.dueOn, now) === 0) return total;
    const settled =
      invoice.payments.reduce((sum, payment) => sum + payment.amountCents, 0) +
      invoice.creditMemos.reduce((sum, memo) => sum + memo.amountCents, 0);
    return total + (invoice.amountCents - settled);
  }, 0);
  const unappliedDepositCents = deposits
    .filter((deposit) => deposit.status === "RECEIVED")
    .reduce((total, deposit) => total + deposit.amountCents, 0);

  // Only invoices that still owe something are worth applying a credit or deposit to.
  const openInvoices: OpenInvoiceOption[] = live
    .filter((invoice) => {
      const settled =
        invoice.payments.reduce((sum, payment) => sum + payment.amountCents, 0) +
        invoice.creditMemos.reduce((sum, memo) => sum + memo.amountCents, 0);
      return invoice.status !== "DRAFT" && invoice.amountCents - settled > 0;
    })
    .map((invoice) => ({ id: invoice.id, label: `${invoice.invoiceNumber} — ${formatMoney(invoice.amountCents)}` }));

  const allPayments = invoices.flatMap((invoice) =>
    invoice.payments.map((payment) => ({ payment, invoice })),
  ).sort((a, b) => b.payment.receivedAt.getTime() - a.payment.receivedAt.getTime());

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 p-6">
      <h1 className="text-xl font-semibold text-[var(--bt-text)]">Invoicing — {job.name}</h1>

      <ContractEquation contractPriceCents={contractPriceCents} paidCents={paidCents} />

      <SummaryStrip
        billedCents={billedCents}
        paidCents={paidCents}
        creditedCents={creditedCents}
        overdueCents={overdueCents}
        unappliedDepositCents={unappliedDepositCents}
      />

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

      {activeTab === "invoices" ? (
        <>
          <CreateInvoiceForm jobId={job.id} />
          {invoices.length === 0 ? (
            <EmptyState title="No invoices yet" description="Invoices created for this job will appear here." />
          ) : (
            <Panel>
              <Head columns={["Job", "Invoice ID", "Title", "Status", "~Total price", "~Amount paid", "~Balance due", "Due", "Actions"]} />
              <tbody>
                {invoices.map((invoice) => {
                  const paid = invoice.payments.reduce((sum, payment) => sum + payment.amountCents, 0);
                  const credited = invoice.creditMemos.reduce((sum, memo) => sum + memo.amountCents, 0);
                  const balance = invoice.amountCents - paid - credited;
                  const late = invoice.status !== "PAID" && invoice.status !== "DRAFT" && daysOverdue(invoice.dueOn, now);
                  const canAct = invoice.status !== "VOID" && invoice.status !== "PAID";
                  return (
                    <tr key={invoice.id} className="border-b align-top last:border-0" style={{ borderColor: "var(--bt-border)" }}>
                      <td className="px-4 py-3 text-[var(--bt-muted)]">{job.name}</td>
                      <td className="px-4 py-3 font-medium">
                        <Link href={`/jobs/${job.id}/invoices/${invoice.id}`} className="text-[var(--bt-primary)] hover:underline">
                          {invoice.invoiceNumber}
                        </Link>
                        <div className="mt-0.5 flex flex-col text-[10px] text-[var(--bt-muted)]">
                          <span>{PAYMENT_TERMS_LABELS[invoice.paymentTerms]}</span>
                          <span>{invoice.clientLastViewedAt ? `Viewed ${formatDate(invoice.clientLastViewedAt)}` : "Not viewed yet"}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-[var(--bt-text)]">{invoice.title ?? "—"}</td>
                      <td className="px-4 py-3">
                        <Badge status={invoice.status} />
                      </td>
                      <td className="px-4 py-3 text-right text-[var(--bt-text)]">{formatMoney(invoice.amountCents)}</td>
                      <td className="px-4 py-3 text-right text-[var(--bt-text)]">{formatMoney(paid)}</td>
                      <td className="px-4 py-3 text-right text-[var(--bt-text)]">{formatMoney(balance)}</td>
                      <td className="px-4 py-3 text-[var(--bt-muted)]">
                        {formatDate(invoice.dueOn)}
                        {late ? (
                          <span className="ml-1.5 text-[10px] font-semibold" style={{ color: "var(--bt-danger)" }}>
                            {late}d late
                          </span>
                        ) : null}
                      </td>
                      <td className="px-4 py-3">
                        {canAct ? (
                          <div className="flex flex-col items-start gap-1">
                            <RecordPaymentForm jobId={job.id} invoiceId={invoice.id} />
                            <VoidInvoiceButton jobId={job.id} invoiceId={invoice.id} />
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t font-semibold" style={{ borderColor: "var(--bt-border)" }}>
                  <td className="px-4 py-3" colSpan={4}>
                    Totals
                  </td>
                  <td className="px-4 py-3 text-right text-[var(--bt-text)]">{formatMoney(billedCents)}</td>
                  <td className="px-4 py-3 text-right text-[var(--bt-text)]">{formatMoney(paidCents)}</td>
                  <td className="px-4 py-3 text-right text-[var(--bt-text)]">{formatMoney(billedCents - paidCents - creditedCents)}</td>
                  <td className="px-4 py-3" colSpan={2} />
                </tr>
              </tfoot>
            </Panel>
          )}
        </>
      ) : null}

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
          <EmptyState title="No payments yet" description="Payments recorded against this job's invoices show up here." />
        ) : (
          <Panel>
            <Head columns={["Received", "Invoice", "Method", "Reference", "~Amount"]} />
            <tbody>
              {allPayments.map(({ payment, invoice }) => (
                <tr key={payment.id} className="border-b last:border-0" style={{ borderColor: "var(--bt-border)" }}>
                  <td className="px-4 py-3 text-[var(--bt-muted)]">{formatDate(payment.receivedAt)}</td>
                  <td className="px-4 py-3">
                    <Link href={`/jobs/${job.id}/invoices/${invoice.id}`} className="text-[var(--bt-primary)] hover:underline">
                      {invoice.invoiceNumber}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-[var(--bt-muted)]">{payment.method.replace(/_/g, " ")}</td>
                  <td className="px-4 py-3 text-[var(--bt-muted)]">{payment.reference ?? "—"}</td>
                  <td className="px-4 py-3 text-right text-[var(--bt-text)]">{formatMoney(payment.amountCents)}</td>
                </tr>
              ))}
            </tbody>
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
    </div>
  );
}
