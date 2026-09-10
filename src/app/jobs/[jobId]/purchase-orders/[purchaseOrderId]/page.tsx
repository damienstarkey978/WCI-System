import Link from "next/link";
import { notFound } from "next/navigation";

import { SetupNotice } from "@/app/admin/setup-notice";
import { currentAppUser } from "@/lib/auth";
import { extendedCostCents } from "@/lib/budget/funnel";
import { db } from "@/lib/db";
import { formatDate, formatMoney } from "@/lib/format";
import { purchaseOrderProgress } from "@/lib/purchase-orders/workflow";

import { PO_STATUS_STYLE, WORK_STATUS_STYLE } from "../status-styles";
import { WorkflowButtons } from "./workflow-buttons";

export const dynamic = "force-dynamic";

const EVENT_LABEL: Record<string, string> = {
  CREATED: "Created",
  SENT_FOR_APPROVAL: "Sent for approval",
  APPROVED: "Approved",
  DECLINED: "Declined",
  AMENDED: "Amended",
  RECALLED: "Recalled",
  WORK_MARKED_COMPLETE: "Work marked complete",
  WORK_REOPENED: "Work reopened",
};

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border bg-[var(--bt-panel-bg)] p-4" style={{ borderColor: "var(--bt-border)" }}>
      <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--bt-muted)]">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-[var(--bt-muted)]">{label}</div>
      <div className="mt-0.5 text-sm text-[var(--bt-text)]">{value}</div>
    </div>
  );
}

export default async function PurchaseOrderDetailPage({
  params,
}: PageProps<"/jobs/[jobId]/purchase-orders/[purchaseOrderId]">) {
  const { jobId, purchaseOrderId } = await params;

  let user;
  try {
    user = await currentAppUser();
  } catch (error) {
    return <SetupNotice detail={error instanceof Error ? error.message : String(error)} />;
  }
  if (!user) return <SetupNotice detail="No organization found. Seed the database, then reload." />;

  const purchaseOrder = await db.purchaseOrder.findFirst({
    where: { id: purchaseOrderId, organizationId: user.organizationId, jobId },
    include: {
      job: { select: { name: true } },
      vendor: { select: { id: true, name: true, email: true } },
      lineItems: { orderBy: { sortOrder: "asc" }, include: { costCode: { select: { code: true, name: true } } } },
      bills: {
        orderBy: { createdAt: "desc" },
        select: { id: true, billNumber: true, approvalStatus: true, lineItems: { select: { amountCents: true } } },
      },
      events: {
        orderBy: { createdAt: "desc" },
        include: { actorUser: { select: { name: true, email: true } } },
      },
    },
  });
  if (!purchaseOrder) notFound();

  const progress = await purchaseOrderProgress(user.organizationId, purchaseOrder.id);
  const statusStyle = PO_STATUS_STYLE[purchaseOrder.status] ?? PO_STATUS_STYLE.DRAFT;
  const workStyle = WORK_STATUS_STYLE[purchaseOrder.workStatus];

  // What the vendor actually agreed to, when they've agreed to something: the frozen
  // snapshot rather than the live (possibly since-edited) scope of work.
  const agreementText = purchaseOrder.agreementSnapshot ?? purchaseOrder.scopeOfWork;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href={`/jobs/${jobId}/purchase-orders`}
            className="text-xs text-[var(--bt-muted)] hover:underline"
          >
            ← Purchase orders
          </Link>
          <h1 className="mt-1 text-xl font-semibold text-[var(--bt-text)]">
            {purchaseOrder.poNumber}
            {purchaseOrder.poSuffix ? `-${purchaseOrder.poSuffix}` : ""}
            {purchaseOrder.title ? ` — ${purchaseOrder.title}` : ""}
          </h1>
          <div className="mt-1 text-sm text-[var(--bt-muted)]">{purchaseOrder.job.name}</div>
        </div>
        <div className="flex items-center gap-2">
          <span
            className="rounded px-2 py-1 text-[10px] font-semibold"
            style={{ background: statusStyle.bg, color: statusStyle.text }}
          >
            {purchaseOrder.status.replace(/_/g, " ")}
          </span>
          <span
            className="rounded px-2 py-1 text-[10px] font-semibold"
            style={{ background: workStyle.bg, color: workStyle.text }}
          >
            {purchaseOrder.workStatus.replace(/_/g, " ")}
          </span>
          {purchaseOrder.version > 1 ? (
            <span className="rounded bg-black/5 px-2 py-1 text-[10px] font-semibold text-[var(--bt-muted)]">
              v{purchaseOrder.version}
            </span>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <Panel title="General information">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                label="Assigned to"
                value={
                  purchaseOrder.vendor ? (
                    <Link href={`/vendors/${purchaseOrder.vendor.id}`} className="hover:underline">
                      {purchaseOrder.vendor.name}
                    </Link>
                  ) : (
                    // A PO can be cut to a vendor with no portal account; vendorName is
                    // still the record of who it went to.
                    <>
                      {purchaseOrder.vendorName}
                      <span className="ml-1.5 text-xs text-[var(--bt-muted)]">(no portal account)</span>
                    </>
                  )
                }
              />
              <Field label="Materials only" value={purchaseOrder.materialsOnly ? "Yes" : "No"} />
              <Field
                label="Scheduled completion"
                value={purchaseOrder.scheduledCompletionOn ? formatDate(purchaseOrder.scheduledCompletionOn) : "—"}
              />
              <Field
                label="Completed"
                value={purchaseOrder.completedOn ? formatDate(purchaseOrder.completedOn) : "—"}
              />
              <Field label="Created" value={formatDate(purchaseOrder.createdAt)} />
              <Field label="Total cost" value={formatMoney(progress.committedCents)} />
            </div>
          </Panel>

          <Panel title="Line items">
            <table className="w-full text-left text-sm">
              <thead>
                <tr
                  className="border-b text-xs font-semibold uppercase tracking-wide text-[var(--bt-muted)]"
                  style={{ borderColor: "var(--bt-border)" }}
                >
                  <th className="py-2">Title</th>
                  <th className="py-2">Cost code</th>
                  <th className="py-2 text-right">Qty</th>
                  <th className="py-2 text-right">Unit cost</th>
                  <th className="py-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {purchaseOrder.lineItems.map((item) => (
                  <tr key={item.id} className="border-b last:border-0" style={{ borderColor: "var(--bt-border)" }}>
                    <td className="py-2 text-[var(--bt-text)]">{item.title}</td>
                    <td className="py-2 text-[var(--bt-muted)]">
                      {item.costCode.code} {item.costCode.name}
                    </td>
                    <td className="py-2 text-right text-[var(--bt-muted)]">{(item.quantityMilli / 1000).toFixed(2)}</td>
                    <td className="py-2 text-right text-[var(--bt-muted)]">{formatMoney(item.unitCostCents)}</td>
                    <td className="py-2 text-right text-[var(--bt-text)]">
                      {formatMoney(extendedCostCents(item.quantityMilli, item.unitCostCents))}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-semibold text-[var(--bt-text)]">
                  <td className="py-2" colSpan={4}>
                    Total
                  </td>
                  <td className="py-2 text-right">{formatMoney(progress.committedCents)}</td>
                </tr>
              </tfoot>
            </table>
          </Panel>

          {agreementText ? (
            <Panel title={purchaseOrder.agreementSnapshot ? "Agreement (as accepted)" : "Scope of work"}>
              {purchaseOrder.agreementSnapshot ? (
                <p className="mb-2 text-xs text-[var(--bt-muted)]">
                  Frozen when the vendor accepted on{" "}
                  {purchaseOrder.agreementSnapshotAt ? formatDate(purchaseOrder.agreementSnapshotAt) : "—"}. Editing the
                  scope of work now requires an amend, which re-opens approval.
                </p>
              ) : null}
              <div className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--bt-text)]">{agreementText}</div>
            </Panel>
          ) : null}

          {purchaseOrder.bills.length > 0 ? (
            <Panel title="Bills against this PO">
              <div className="flex flex-col gap-2">
                {purchaseOrder.bills.map((bill) => {
                  const total = bill.lineItems.reduce((sum, item) => sum + item.amountCents, 0);
                  return (
                    <Link
                      key={bill.id}
                      href={`/jobs/${jobId}/bills`}
                      className="flex items-center justify-between rounded border px-3 py-2 text-sm hover:bg-black/5"
                      style={{ borderColor: "var(--bt-border)" }}
                    >
                      <span className="text-[var(--bt-text)]">{bill.billNumber ?? "Bill"}</span>
                      <span className="flex items-center gap-3">
                        <span className="text-xs text-[var(--bt-muted)]">
                          {bill.approvalStatus.replace(/_/g, " ")}
                        </span>
                        <span className="text-[var(--bt-text)]">{formatMoney(total)}</span>
                      </span>
                    </Link>
                  );
                })}
              </div>
            </Panel>
          ) : null}
        </div>

        <div className="flex flex-col gap-4">
          <Panel title="Purchase order status">
            <div className="text-sm text-[var(--bt-text)]">
              {progress.billedPercent}% billed
              <span className="ml-1 text-[var(--bt-muted)]">
                ({formatMoney(progress.billedCents)} of {formatMoney(progress.committedCents)})
              </span>
            </div>
            <div className="mt-2 h-2 w-full overflow-hidden rounded bg-black/10">
              <div
                className="h-full rounded"
                style={{
                  width: `${Math.min(100, progress.billedPercent)}%`,
                  background: "var(--bt-primary)",
                }}
              />
            </div>
            <div className="mt-3 grid gap-2">
              <Field label="Paid" value={formatMoney(progress.paidCents)} />
              <Field label="Outstanding" value={formatMoney(progress.outstandingCents)} />
            </div>
          </Panel>

          <Panel title="Approvals">
            {purchaseOrder.approvedAt ? (
              <div className="grid gap-2">
                <Field
                  label="Approved by"
                  value={
                    purchaseOrder.approvedBy === "VENDOR"
                      ? `${purchaseOrder.vendorSignatureName ?? purchaseOrder.vendorName} (vendor)`
                      : "Staff (internal)"
                  }
                />
                <Field label="Approved on" value={formatDate(purchaseOrder.approvedAt)} />
                {purchaseOrder.agreementSnapshot ? (
                  <a href="#agreement" className="text-sm hover:underline" style={{ color: "var(--bt-primary)" }}>
                    View agreement
                  </a>
                ) : null}
              </div>
            ) : purchaseOrder.declinedAt ? (
              <p className="text-sm" style={{ color: "var(--bt-danger)" }}>
                Declined on {formatDate(purchaseOrder.declinedAt)}
              </p>
            ) : (
              <p className="text-sm text-[var(--bt-muted)]">Not yet approved.</p>
            )}
          </Panel>

          <Panel title="Actions">
            <WorkflowButtons
              jobId={jobId}
              purchaseOrderId={purchaseOrder.id}
              status={purchaseOrder.status}
              workComplete={purchaseOrder.workStatus === "WORK_COMPLETE"}
            />
          </Panel>

          <Panel title="Internal notes">
            <p className="text-xs text-[var(--bt-muted)]">Staff only — never shown to the vendor.</p>
            <div className="mt-2 whitespace-pre-wrap text-sm text-[var(--bt-text)]">
              {purchaseOrder.internalNotes ?? <span className="text-[var(--bt-muted)]">None.</span>}
            </div>
          </Panel>

          <Panel title="History">
            <ol className="flex flex-col gap-2">
              {purchaseOrder.events.map((event) => (
                <li key={event.id} className="text-sm">
                  <div className="text-[var(--bt-text)]">
                    {EVENT_LABEL[event.type] ?? event.type}
                    {event.version > 1 ? <span className="text-[var(--bt-muted)]"> (v{event.version})</span> : null}
                  </div>
                  <div className="text-xs text-[var(--bt-muted)]">
                    {formatDate(event.createdAt)}
                    {event.actorUser ? ` · ${event.actorUser.name ?? event.actorUser.email}` : ""}
                  </div>
                  {event.note ? <div className="text-xs text-[var(--bt-muted)]">{event.note}</div> : null}
                </li>
              ))}
            </ol>
          </Panel>
        </div>
      </div>
    </div>
  );
}
