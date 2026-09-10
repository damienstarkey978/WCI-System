import Link from "next/link";
import { notFound } from "next/navigation";

import { SetupNotice } from "@/app/admin/setup-notice";
import { currentAppUser } from "@/lib/auth";
import { TEMPLATE_NAMES } from "@/lib/bills/lien-waivers";
import { db } from "@/lib/db";
import { formatDate, formatMoney } from "@/lib/format";

import { ApproversPanel, LienWaiverPanel, StatusActions } from "./bill-panels";

export const dynamic = "force-dynamic";

const STATUS_STYLE: Record<string, { bg: string; text: string }> = {
  INBOX: { bg: "#e5e7eb", text: "#374151" },
  IN_REVIEW: { bg: "color-mix(in srgb, var(--bt-hazard) 14%, transparent)", text: "var(--bt-hazard)" },
  APPROVED: { bg: "color-mix(in srgb, var(--bt-primary) 14%, transparent)", text: "var(--bt-primary)" },
  READY_FOR_PAYMENT: { bg: "color-mix(in srgb, var(--bt-primary) 14%, transparent)", text: "var(--bt-primary)" },
  PAID: { bg: "var(--bt-status-open-bg)", text: "var(--bt-status-open-text)" },
  VOID: { bg: "color-mix(in srgb, var(--bt-danger) 14%, transparent)", text: "var(--bt-danger)" },
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

export default async function BillDetailPage({ params }: PageProps<"/jobs/[jobId]/bills/[billId]">) {
  const { jobId, billId } = await params;

  let user;
  try {
    user = await currentAppUser();
  } catch (error) {
    return <SetupNotice detail={error instanceof Error ? error.message : String(error)} />;
  }
  if (!user) return <SetupNotice detail="No organization found. Seed the database, then reload." />;

  const bill = await db.bill.findFirst({
    where: { id: billId, organizationId: user.organizationId, jobId },
    include: {
      job: { select: { name: true } },
      vendor: { select: { id: true, name: true } },
      purchaseOrder: { select: { id: true, poNumber: true, title: true } },
      linkedScheduleItem: { select: { id: true, title: true } },
      createdByUser: { select: { name: true, email: true } },
      lineItems: { orderBy: { sortOrder: "asc" }, include: { costCode: { select: { code: true, name: true } } } },
      files: { select: { id: true, fileName: true, url: true } },
      approvals: { include: { approverUser: { select: { name: true, email: true } } } },
      lienWaivers: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  if (!bill) notFound();

  const [staff, qboConnection] = await Promise.all([
    db.user.findMany({
      where: { organizationId: user.organizationId, isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true },
    }),
    db.quickBooksConnection.findUnique({ where: { organizationId: user.organizationId } }),
  ]);
  const isQboConnected = Boolean(qboConnection && !qboConnection.disconnectedAt);

  const totalCents = bill.lineItems.reduce((total, item) => total + item.amountCents, 0);
  const style = STATUS_STYLE[bill.approvalStatus] ?? STATUS_STYLE.IN_REVIEW;
  const waiver = bill.lienWaivers[0] ?? null;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href={`/jobs/${jobId}/bills`} className="text-xs text-[var(--bt-muted)] hover:underline">
            ← Bills
          </Link>
          <h1 className="mt-1 text-xl font-semibold text-[var(--bt-text)]">
            {bill.title ?? bill.billNumber ?? bill.vendorName}
          </h1>
          <div className="mt-1 text-sm text-[var(--bt-muted)]">{bill.job.name}</div>
        </div>
        <div className="flex items-center gap-2">
          {bill.fromOcr ? (
            <span className="rounded bg-black/5 px-2 py-1 text-[10px] font-semibold text-[var(--bt-muted)]">
              AI extracted
            </span>
          ) : null}
          <span className="rounded px-2 py-1 text-[10px] font-semibold" style={{ background: style.bg, color: style.text }}>
            {bill.approvalStatus.replace(/_/g, " ")}
          </span>
        </div>
      </div>

      {bill.fromOcr && bill.approvalStatus === "IN_REVIEW" ? (
        <p
          className="rounded-lg border px-3 py-2 text-sm"
          style={{
            borderColor: "var(--bt-hazard)",
            background: "color-mix(in srgb, var(--bt-hazard) 8%, transparent)",
            color: "var(--bt-text)",
          }}
        >
          These figures were read from the attachment by AI. Check them against the receipt before approving — nothing
          here counts as an actual cost until it is.
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <Panel title="Details">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                label="Pay to"
                value={
                  bill.vendor ? (
                    <Link href={`/vendors/${bill.vendor.id}`} className="hover:underline">
                      {bill.vendor.name}
                    </Link>
                  ) : (
                    bill.vendorName
                  )
                }
              />
              <Field label="Bill #" value={bill.billNumber ?? "—"} />
              <Field
                label="Purchase order"
                value={
                  bill.purchaseOrder ? (
                    <Link
                      href={`/jobs/${jobId}/purchase-orders/${bill.purchaseOrder.id}`}
                      className="hover:underline"
                      style={{ color: "var(--bt-primary)" }}
                    >
                      {bill.purchaseOrder.poNumber}
                      {bill.purchaseOrder.title ? ` — ${bill.purchaseOrder.title}` : ""}
                    </Link>
                  ) : (
                    "—"
                  )
                }
              />
              <Field label="Schedule item" value={bill.linkedScheduleItem?.title ?? "—"} />
              <Field label="Invoice date" value={bill.issuedOn ? formatDate(bill.issuedOn) : "—"} />
              <Field label="Due" value={bill.dueOn ? formatDate(bill.dueOn) : "—"} />
              <Field label="Paid" value={bill.paidAt ? formatDate(bill.paidAt) : "—"} />
              <Field
                label="Created by"
                value={bill.createdByUser?.name ?? bill.createdByUser?.email ?? "—"}
              />
            </div>
            {bill.description ? (
              <p className="mt-3 whitespace-pre-wrap text-sm text-[var(--bt-text)]">{bill.description}</p>
            ) : null}
          </Panel>

          <Panel title="Costs">
            <table className="w-full text-left text-sm">
              <thead>
                <tr
                  className="border-b text-xs font-semibold uppercase tracking-wide text-[var(--bt-muted)]"
                  style={{ borderColor: "var(--bt-border)" }}
                >
                  <th className="py-2">Title</th>
                  <th className="py-2">Cost code</th>
                  <th className="py-2">Cost type</th>
                  <th className="py-2 text-right">Builder cost</th>
                </tr>
              </thead>
              <tbody>
                {bill.lineItems.map((item) => (
                  <tr key={item.id} className="border-b last:border-0" style={{ borderColor: "var(--bt-border)" }}>
                    <td className="py-2 text-[var(--bt-text)]">{item.title}</td>
                    <td className="py-2 text-[var(--bt-muted)]">
                      {item.costCode.code} {item.costCode.name}
                    </td>
                    <td className="py-2 text-[var(--bt-muted)]">{item.costType.replace(/_/g, " ")}</td>
                    <td className="py-2 text-right text-[var(--bt-text)]">{formatMoney(item.amountCents)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-semibold text-[var(--bt-text)]">
                  <td className="py-2" colSpan={3}>
                    Total
                  </td>
                  <td className="py-2 text-right">{formatMoney(totalCents)}</td>
                </tr>
              </tfoot>
            </table>
          </Panel>

          <Panel title="Lien waiver">
            <LienWaiverPanel
              jobId={jobId}
              billId={bill.id}
              templates={TEMPLATE_NAMES}
              waiver={
                waiver
                  ? {
                      id: waiver.id,
                      templateName: waiver.templateName,
                      status: waiver.status,
                      releasedAt: waiver.releasedAt ? formatDate(waiver.releasedAt) : null,
                      body: waiver.body,
                    }
                  : null
              }
            />
          </Panel>

          <Panel title="Attachments">
            {bill.files.length === 0 ? (
              <p className="text-xs text-[var(--bt-muted)]">
                No attachment. The original receipt lives here when a bill arrives by upload or email.
              </p>
            ) : (
              <ul className="flex flex-col gap-1">
                {bill.files.map((file) => (
                  <li key={file.id} className="text-sm">
                    <Link href={`/jobs/${jobId}/files`} className="hover:underline" style={{ color: "var(--bt-primary)" }}>
                      {file.fileName}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <div className="flex flex-col gap-4">
          <Panel title="Actions">
            <StatusActions jobId={jobId} billId={bill.id} status={bill.approvalStatus} />
          </Panel>

          <Panel title="Approvers">
            <ApproversPanel
              jobId={jobId}
              billId={bill.id}
              currentUserId={user.id}
              staff={staff.map((person) => ({ id: person.id, label: person.name ?? person.email }))}
              approvals={bill.approvals.map((approval) => ({
                id: approval.id,
                approverUserId: approval.approverUserId,
                label: approval.approverUser.name ?? approval.approverUser.email,
                approvedAt: approval.approvedAt ? formatDate(approval.approvedAt) : null,
                note: approval.note,
              }))}
            />
          </Panel>

          <Panel title="QuickBooks">
            {!isQboConnected ? (
              <p className="text-xs text-[var(--bt-muted)]">
                QuickBooks isn&apos;t connected for this organization.
              </p>
            ) : bill.qboBillId ? (
              <div className="flex flex-col gap-1 text-sm">
                <span style={{ color: "var(--bt-success)" }}>Synced</span>
                <span className="text-xs text-[var(--bt-muted)]">Bill ID {bill.qboBillId}</span>
              </div>
            ) : (
              <p className="text-xs text-[var(--bt-muted)]">Not yet pushed to QuickBooks.</p>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
