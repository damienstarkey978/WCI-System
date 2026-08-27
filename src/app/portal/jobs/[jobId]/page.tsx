import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";

import { currentPortalSession } from "@/lib/client-portal/browser-session";
import { db } from "@/lib/db";
import { formatDate, formatMoney } from "@/lib/format";
import { getComputedSchedule } from "@/lib/scheduling/service";
import { getClientBudgetView } from "@/lib/client-portal/service";

import { ApproveChangeOrderButton, ApproveSelectionOptionButton } from "./approve-buttons";

export const dynamic = "force-dynamic";

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border bg-white" style={{ borderColor: "var(--bt-border)" }}>
      <header className="border-b px-4 py-3" style={{ borderColor: "var(--bt-border)" }}>
        <h2 className="text-sm font-semibold text-[var(--bt-text)]">{title}</h2>
      </header>
      <div>{children}</div>
    </section>
  );
}

export default async function PortalJobPage({ params }: PageProps<"/portal/jobs/[jobId]">) {
  const { jobId } = await params;

  const session = await currentPortalSession();
  if (!session) redirect("/portal");

  const access = await db.clientJobAccess.findUnique({
    where: { clientId_jobId: { clientId: session.clientId, jobId } },
    include: { job: true },
  });
  if (!access) notFound();

  const job = access.job;

  const [dailyLogs, scheduleRow, files, invoices, selections, changeOrders] = await Promise.all([
    access.canViewDailyLogs
      ? db.dailyLog.findMany({ where: { organizationId: session.organizationId, jobId, clientVisible: true }, orderBy: { createdAt: "desc" }, take: 5 })
      : Promise.resolve(null),
    access.canViewSchedule ? db.schedule.findFirst({ where: { organizationId: session.organizationId, jobId } }) : Promise.resolve(null),
    access.canViewDocuments
      ? db.file.findMany({ where: { organizationId: session.organizationId, jobId, clientVisible: true }, orderBy: { createdAt: "desc" }, take: 10 })
      : Promise.resolve(null),
    access.canViewInvoices
      ? db.invoice.findMany({ where: { organizationId: session.organizationId, jobId }, orderBy: { createdAt: "desc" }, take: 10 })
      : Promise.resolve(null),
    access.canViewSelections
      ? db.selection.findMany({ where: { organizationId: session.organizationId, jobId }, orderBy: { createdAt: "desc" }, include: { options: { orderBy: { sortOrder: "asc" } } } })
      : Promise.resolve(null),
    access.canViewChangeOrders
      ? db.changeOrder.findMany({ where: { organizationId: session.organizationId, jobId }, orderBy: { createdAt: "desc" } })
      : Promise.resolve(null),
  ]);

  const schedule = scheduleRow ? await getComputedSchedule(session.organizationId, scheduleRow.id) : null;
  const budget = access.canViewBudget ? await getClientBudgetView(session.organizationId, jobId) : null;

  const address = [job.addressLine1, job.city, job.state].filter(Boolean).join(", ");

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 p-6">
      <div className="rounded-lg border bg-white p-5" style={{ borderColor: "var(--bt-border)" }}>
        <h1 className="text-xl font-semibold text-[var(--bt-text)]">{job.name}</h1>
        {address ? <p className="mt-1 text-sm text-[var(--bt-muted)]">{address}</p> : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {dailyLogs ? (
          <Card title="Recent daily logs">
            <div className="divide-y" style={{ borderColor: "var(--bt-border)" }}>
              {dailyLogs.length === 0 ? (
                <p className="px-4 py-4 text-sm text-[var(--bt-muted)]">No daily logs yet.</p>
              ) : (
                dailyLogs.map((log) => (
                  <div key={log.id} className="px-4 py-3">
                    <div className="text-xs text-[var(--bt-muted)]">{formatDate(log.createdAt)}</div>
                    <p className="mt-1 text-sm text-[var(--bt-text)]">{log.note}</p>
                  </div>
                ))
              )}
            </div>
          </Card>
        ) : null}

        {schedule ? (
          <Card title="Schedule">
            <div className="divide-y" style={{ borderColor: "var(--bt-border)" }}>
              {schedule.items.filter((item) => item.clientVisible).length === 0 ? (
                <p className="px-4 py-4 text-sm text-[var(--bt-muted)]">No schedule items yet.</p>
              ) : (
                schedule.items
                  .filter((item) => item.clientVisible)
                  .slice(0, 6)
                  .map((item) => (
                    <div key={item.id} className="flex items-center justify-between px-4 py-3">
                      <span className="text-sm text-[var(--bt-text)]">{item.title}</span>
                      <span className="text-xs text-[var(--bt-muted)]">{formatDate(item.startDate)}</span>
                    </div>
                  ))
              )}
            </div>
          </Card>
        ) : null}

        {selections ? (
          <Card title="Selections">
            <div className="divide-y" style={{ borderColor: "var(--bt-border)" }}>
              {selections.length === 0 ? (
                <p className="px-4 py-4 text-sm text-[var(--bt-muted)]">No selections yet.</p>
              ) : (
                selections.map((selection) => (
                  <div key={selection.id} className="px-4 py-3">
                    <div className="text-sm font-medium text-[var(--bt-text)]">{selection.title}</div>
                    <div className="mt-2 flex flex-col gap-2">
                      {selection.options.map((option) => (
                        <div key={option.id} className="flex items-center justify-between gap-3 rounded border px-3 py-2" style={{ borderColor: "var(--bt-border)" }}>
                          <div>
                            <div className="text-sm text-[var(--bt-text)]">{option.title}</div>
                            <div className="text-xs text-[var(--bt-muted)]">{formatMoney(option.clientPriceCents)}</div>
                          </div>
                          {option.status === "PENDING" && access.canApproveSelections ? (
                            <ApproveSelectionOptionButton jobId={jobId} selectionId={selection.id} optionId={option.id} />
                          ) : (
                            <span className="text-xs font-semibold text-[var(--bt-muted)]">{option.status}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>
        ) : null}

        {changeOrders ? (
          <Card title="Change orders">
            <div className="divide-y" style={{ borderColor: "var(--bt-border)" }}>
              {changeOrders.length === 0 ? (
                <p className="px-4 py-4 text-sm text-[var(--bt-muted)]">No change orders yet.</p>
              ) : (
                changeOrders.map((co) => (
                  <div key={co.id} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div>
                      <div className="text-sm text-[var(--bt-text)]">{co.title}</div>
                      <div className="text-xs text-[var(--bt-muted)]">{co.status.replace(/_/g, " ")}</div>
                    </div>
                    {co.status === "PENDING_APPROVAL" && access.canApproveChangeOrders ? (
                      <ApproveChangeOrderButton jobId={jobId} changeOrderId={co.id} />
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </Card>
        ) : null}

        {invoices ? (
          <Card title="Invoices">
            <div className="divide-y" style={{ borderColor: "var(--bt-border)" }}>
              {invoices.length === 0 ? (
                <p className="px-4 py-4 text-sm text-[var(--bt-muted)]">No invoices yet.</p>
              ) : (
                invoices.map((invoice) => (
                  <div key={invoice.id} className="flex items-center justify-between px-4 py-3">
                    <span className="text-sm text-[var(--bt-text)]">{invoice.invoiceNumber}</span>
                    <span className="text-sm text-[var(--bt-text)]">{formatMoney(invoice.amountCents)}</span>
                  </div>
                ))
              )}
            </div>
          </Card>
        ) : null}

        {files ? (
          <Card title="Documents">
            <div className="divide-y" style={{ borderColor: "var(--bt-border)" }}>
              {files.length === 0 ? (
                <p className="px-4 py-4 text-sm text-[var(--bt-muted)]">No documents yet.</p>
              ) : (
                files.map((file) => (
                  <a
                    key={file.id}
                    href={file.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-between px-4 py-3 text-sm text-[var(--bt-primary)] hover:underline"
                  >
                    {file.fileName}
                  </a>
                ))
              )}
            </div>
          </Card>
        ) : null}

        {budget ? (
          <Card title="Pricing">
            <div className="flex items-center justify-between px-4 py-3 text-sm">
              <span className="text-[var(--bt-muted)]">Contract price</span>
              <span className="font-medium text-[var(--bt-text)]">{formatMoney(budget.totals.revisedClientPriceCents)}</span>
            </div>
            <div className="flex items-center justify-between px-4 py-3 text-sm">
              <span className="text-[var(--bt-muted)]">Invoiced</span>
              <span className="font-medium text-[var(--bt-text)]">{formatMoney(budget.totals.amountInvoicedCents)}</span>
            </div>
            <div className="flex items-center justify-between border-t px-4 py-3 text-sm" style={{ borderColor: "var(--bt-border)" }}>
              <span className="text-[var(--bt-muted)]">Remaining to invoice</span>
              <span className="font-medium text-[var(--bt-text)]">{formatMoney(budget.totals.remainingToInvoiceCents)}</span>
            </div>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
