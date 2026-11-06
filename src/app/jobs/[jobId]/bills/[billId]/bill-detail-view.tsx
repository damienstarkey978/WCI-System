"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { PoCostLineItems } from "@/components/financial/PoCostLineItems";
import type { CostCodeOption } from "@/components/financial/CostCodeLineItems";
import { CloseIcon } from "@/components/shell/icons";
import { displayBillNumber } from "@/lib/bills/bill-number";
import { formatMoney } from "@/lib/format";

import {
  AddToInvoicePanel,
  ApproversPanel,
  LienWaiverPanel,
  StatusActions,
} from "./bill-panels";
import {
  applyLienWaiverAction,
  deleteBillAction,
  updateBillAction,
  type BillActionState,
} from "./actions";

const BT_LINK = "#1F4ECD";
const BT_NAVY = "#163a8a";
const EDIT_FORM_ID = "bill-edit-form";

const STATUS_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  INBOX: { bg: "#e5e7eb", text: "#374151", label: "Inbox" },
  IN_REVIEW: { bg: "#e5e7eb", text: "#374151", label: "Draft" },
  APPROVED: { bg: "#dbeafe", text: "#1d4ed8", label: "Approved" },
  READY_FOR_PAYMENT: { bg: "#ede9fe", text: "#6d28d9", label: "Ready for Payment" },
  PAID: { bg: "#dcfce7", text: "#15803d", label: "Paid" },
  VOID: { bg: "#fee2e2", text: "#b91c1c", label: "Void" },
};

const LIEN_TEMPLATES = [
  { key: "conditional", label: "Conditional", templateName: "Conditional" },
  { key: "unconditional", label: "Unconditional", templateName: "Unconditional" },
  { key: "final", label: "Final unconditional", templateName: "Final unconditional" },
] as const;

export type BillDetailLine = {
  readonly id: string;
  readonly title: string;
  readonly costCodeId: string;
  readonly costCodeLabel: string;
  readonly costType: string;
  readonly costTypeLabel: string;
  readonly amountCents: number;
};

export type BillDetailFile = {
  readonly id: string;
  readonly fileName: string;
  readonly url: string;
};

export type BillDetailApproval = {
  readonly id: string;
  readonly approverUserId: string;
  readonly label: string;
  readonly approvedAt: string | null;
  readonly note: string | null;
};

export type BillDetailWaiver = {
  readonly id: string;
  readonly templateName: string;
  readonly status: string;
  readonly releasedAt: string | null;
  readonly body: string | null;
};

export type BillDetailProps = {
  readonly jobId: string;
  readonly jobName: string;
  readonly billId: string;
  readonly currentUserId: string;
  readonly title: string | null;
  readonly billNumber: string | null;
  readonly vendorName: string;
  readonly vendorId: string | null;
  readonly vendorHref: string | null;
  readonly purchaseOrderLabel: string | null;
  readonly purchaseOrderHref: string | null;
  readonly scheduleItemTitle: string | null;
  readonly issuedOnValue: string;
  readonly dueOnValue: string;
  readonly paidAtLabel: string;
  readonly description: string | null;
  readonly approvalStatus: string;
  readonly fromOcr: boolean;
  readonly billableToClient: boolean;
  readonly sendToQuickBooks: boolean | null;
  readonly quickBooksSkipReason: string | null;
  readonly qboBillId: string | null;
  readonly isQboConnected: boolean;
  readonly createdByLabel: string;
  readonly lines: readonly BillDetailLine[];
  readonly costCodes: readonly CostCodeOption[];
  readonly files: readonly BillDetailFile[];
  readonly staff: readonly { id: string; label: string }[];
  readonly approvals: readonly BillDetailApproval[];
  readonly waiver: BillDetailWaiver | null;
  readonly lienTemplates: readonly string[];
  readonly draftInvoices: readonly { id: string; label: string }[];
  readonly billedOn: { invoiceId: string; invoiceNumber: string; status: string } | null;
  readonly initialTab?: "bill" | "lien";
};

function FieldLabel({ label }: { label: string }) {
  return <div className="mb-1 text-xs font-medium text-[var(--bt-muted)]">{label}</div>;
}

function ReadField({ value }: { value: React.ReactNode }) {
  return (
    <div
      className="min-h-[2.5rem] rounded-md border bg-[var(--bt-panel-bg)] px-3 py-2 text-sm text-[var(--bt-text)]"
      style={{ borderColor: "var(--bt-border)" }}
    >
      {value || <span className="text-[var(--bt-muted)]">—</span>}
    </div>
  );
}

const fieldClass =
  "w-full min-h-[2.5rem] rounded-md border bg-[var(--bt-panel-bg)] px-3 py-2 text-sm text-[var(--bt-text)] outline-none focus:border-[var(--bt-link,#1F4ECD)]";

const INITIAL: BillActionState = {};

/**
 * Buildertrend Bill detail — editable when not PAID/VOID. Every visible control
 * either works (Save, QB, billable, lien apply, status, delete) or is absent.
 */
export function BillDetailView(props: BillDetailProps) {
  const router = useRouter();
  const [tab, setTab] = useState<"bill" | "lien">(props.initialTab ?? "bill");
  const [documentOpen, setDocumentOpen] = useState(props.files.length > 0);
  const [deleteState, deleteAction, deleting] = useActionState(deleteBillAction, INITIAL);
  const [saveState, saveAction, saving] = useActionState(updateBillAction, INITIAL);
  const [lienState, lienAction, applyingLien] = useActionState(applyLienWaiverAction, INITIAL);

  const editable = props.approvalStatus !== "PAID" && props.approvalStatus !== "VOID";
  const listHref = `/jobs/${props.jobId}/bills`;
  const statusStyle = STATUS_STYLE[props.approvalStatus] ?? STATUS_STYLE.IN_REVIEW;
  const totalCents = props.lines.reduce((sum, line) => sum + line.amountCents, 0);
  const displayNumber = displayBillNumber(props.billNumber) ?? props.billNumber;
  const canDelete = props.approvalStatus === "INBOX" || props.approvalStatus === "IN_REVIEW";
  const waiverReleased = props.waiver?.status === "RELEASED";
  const waiverTemplate = props.waiver?.templateName ?? "";

  const [sendToQuickBooks, setSendToQuickBooks] = useState(props.sendToQuickBooks === true);
  const [billableToClient, setBillableToClient] = useState(props.billableToClient);

  const qbStatusLabel = (() => {
    if (props.qboBillId) return "Synced";
    if (!sendToQuickBooks) return "Not Billed";
    if (!props.isQboConnected) return "Not connected";
    return "Marked to send";
  })();

  function close() {
    router.push(listHref);
  }

  useEffect(() => {
    if (deleteState.ok) {
      router.push(listHref);
      router.refresh();
    }
  }, [deleteState.ok, listHref, router]);

  useEffect(() => {
    if (saveState.ok) router.refresh();
  }, [saveState.ok, router]);

  useEffect(() => {
    if (lienState.ok) router.refresh();
  }, [lienState.ok, router]);

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center sm:items-center sm:p-3">
      <button type="button" className="absolute inset-0 bg-black/40" aria-label="Close bill" onClick={close} />
      <div
        className="relative flex max-h-[96vh] w-full max-w-5xl flex-col overflow-hidden rounded-t-lg bg-[var(--bt-panel-bg)] shadow-xl sm:max-h-[92vh] sm:rounded-lg"
        role="dialog"
        aria-modal="true"
        aria-label="Bill"
      >
        <header
          className="flex shrink-0 items-start justify-between gap-3 border-b px-4 py-3 sm:px-5"
          style={{ borderColor: "var(--bt-border)" }}
        >
          <div className="min-w-0">
            <div className="truncate text-xs text-[var(--bt-muted)]">{props.jobName}</div>
            <h1 className="text-lg font-semibold text-[var(--bt-text)]">Bill</h1>
          </div>
          <button type="button" onClick={close} aria-label="Close" className="rounded p-1.5 text-[var(--bt-muted)] hover:bg-black/5">
            <CloseIcon className="h-4 w-4" />
          </button>
        </header>

        <div className="flex min-h-0 flex-1 overflow-hidden">
          <div
            className={`flex shrink-0 flex-col border-r bg-[var(--bt-panel-bg-muted,#f3f4f6)] transition-all ${documentOpen ? "w-56" : "w-9"}`}
            style={{ borderColor: "var(--bt-border)" }}
          >
            <button
              type="button"
              onClick={() => setDocumentOpen((open) => !open)}
              className="flex h-full min-h-[8rem] items-center justify-center px-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--bt-muted)] hover:bg-black/5"
              aria-expanded={documentOpen}
              aria-label="Document attachments"
              style={{
                writingMode: documentOpen ? undefined : "vertical-rl",
                transform: documentOpen ? undefined : "rotate(180deg)",
              }}
            >
              {documentOpen ? "Document ▾" : "Document ›"}
            </button>
            {documentOpen ? (
              <div className="space-y-2 border-t p-3 text-xs" style={{ borderColor: "var(--bt-border)" }}>
                {props.files.length === 0 ? (
                  <p className="text-[var(--bt-muted)]">
                    No attachment. Receipts land here when a bill arrives by upload or email.
                  </p>
                ) : (
                  <ul className="flex flex-col gap-1.5">
                    {props.files.map((file) => (
                      <li key={file.id}>
                        <a
                          href={file.url}
                          target="_blank"
                          rel="noreferrer"
                          className="break-all hover:underline"
                          style={{ color: BT_LINK }}
                        >
                          {file.fileName}
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
                <Link href={`/jobs/${props.jobId}/files`} className="inline-block hover:underline" style={{ color: BT_LINK }}>
                  Open Files
                </Link>
              </div>
            ) : null}
          </div>

          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <div className="flex shrink-0 items-center justify-between gap-3 border-b px-4 sm:px-5" style={{ borderColor: "var(--bt-border)" }}>
              <nav className="flex gap-1" aria-label="Bill sections">
                {(
                  [
                    ["bill", "Bill"],
                    ["lien", "Lien Waiver"],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setTab(key)}
                    className="-mb-px border-b-2 px-3 py-2.5 text-sm font-medium"
                    style={{
                      borderColor: tab === key ? BT_LINK : "transparent",
                      color: tab === key ? BT_LINK : "var(--bt-muted)",
                    }}
                  >
                    {label}
                  </button>
                ))}
              </nav>
              <span
                className="rounded px-2 py-0.5 text-[11px] font-semibold"
                style={{ background: statusStyle.bg, color: statusStyle.text }}
              >
                {statusStyle.label}
              </span>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              {tab === "bill" ? (
                <div className="flex flex-col gap-5 p-4 sm:p-5">
                  {props.fromOcr && props.approvalStatus === "IN_REVIEW" ? (
                    <p
                      className="rounded-md border px-3 py-2 text-sm"
                      style={{
                        borderColor: "var(--bt-hazard)",
                        background: "color-mix(in srgb, var(--bt-hazard) 8%, transparent)",
                        color: "var(--bt-text)",
                      }}
                    >
                      These figures were read from the attachment by AI. Check them against the receipt before approving.
                    </p>
                  ) : null}

                  <form id={EDIT_FORM_ID} action={saveAction} className="flex flex-col gap-5">
                    <input type="hidden" name="jobId" value={props.jobId} />
                    <input type="hidden" name="billId" value={props.billId} />
                    <input type="hidden" name="sendToQuickBooks" value={sendToQuickBooks ? "true" : "false"} />
                    <input type="hidden" name="billableToClient" value={billableToClient ? "true" : "false"} />
                    {!sendToQuickBooks ? (
                      <input
                        type="hidden"
                        name="quickBooksSkipReason"
                        value={props.quickBooksSkipReason ?? "Skipped QuickBooks on save"}
                      />
                    ) : null}

                    <section className="flex flex-col gap-3">
                      <div className="grid gap-3 sm:grid-cols-3">
                        <div>
                          <FieldLabel label="Job" />
                          <ReadField value={props.jobName} />
                        </div>
                        <div>
                          <FieldLabel label="Title" />
                          {editable ? (
                            <input
                              name="title"
                              defaultValue={props.title ?? ""}
                              className={fieldClass}
                              style={{ borderColor: "var(--bt-border)" }}
                            />
                          ) : (
                            <ReadField value={props.title} />
                          )}
                        </div>
                        <div>
                          <FieldLabel label="Bill #" />
                          {editable ? (
                            <input
                              name="billNumber"
                              defaultValue={displayNumber ?? ""}
                              placeholder="Vendor invoice #"
                              className={fieldClass}
                              style={{ borderColor: "var(--bt-border)" }}
                            />
                          ) : (
                            <ReadField value={displayNumber} />
                          )}
                        </div>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-3">
                        <div>
                          <FieldLabel label="Pay to" />
                          <ReadField
                            value={
                              props.vendorHref ? (
                                <Link href={props.vendorHref} className="hover:underline" style={{ color: BT_LINK }}>
                                  {props.vendorName}
                                </Link>
                              ) : (
                                props.vendorName
                              )
                            }
                          />
                        </div>
                        <div>
                          <FieldLabel label="Purchase Order" />
                          <ReadField
                            value={
                              props.purchaseOrderHref && props.purchaseOrderLabel ? (
                                <Link href={props.purchaseOrderHref} className="hover:underline" style={{ color: BT_LINK }}>
                                  {props.purchaseOrderLabel}
                                </Link>
                              ) : (
                                props.purchaseOrderLabel ?? "-- None Selected --"
                              )
                            }
                          />
                        </div>
                        <div>
                          <FieldLabel label="Date paid" />
                          <ReadField value={props.paidAtLabel} />
                        </div>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                          <FieldLabel label="Invoice date" />
                          {editable ? (
                            <input
                              type="date"
                              name="issuedOn"
                              defaultValue={props.issuedOnValue}
                              className={fieldClass}
                              style={{ borderColor: "var(--bt-border)" }}
                            />
                          ) : (
                            <ReadField value={props.issuedOnValue || "—"} />
                          )}
                        </div>
                        <div>
                          <FieldLabel label="Due date" />
                          {editable ? (
                            <input
                              type="date"
                              name="dueOn"
                              defaultValue={props.dueOnValue}
                              className={fieldClass}
                              style={{ borderColor: "var(--bt-border)" }}
                            />
                          ) : (
                            <ReadField value={props.dueOnValue || "—"} />
                          )}
                          {props.scheduleItemTitle ? (
                            <p className="mt-1 text-xs" style={{ color: BT_LINK }}>
                              Linked: {props.scheduleItemTitle}
                            </p>
                          ) : null}
                        </div>
                      </div>

                      <div>
                        <FieldLabel label="Description" />
                        {editable ? (
                          <textarea
                            name="description"
                            rows={3}
                            defaultValue={props.description ?? ""}
                            className={fieldClass}
                            style={{ borderColor: "var(--bt-border)" }}
                          />
                        ) : (
                          <div
                            className="min-h-[5rem] whitespace-pre-wrap rounded-md border px-3 py-2 text-sm text-[var(--bt-text)]"
                            style={{ borderColor: "var(--bt-border)" }}
                          >
                            {props.description || <span className="text-[var(--bt-muted)]">—</span>}
                          </div>
                        )}
                      </div>
                    </section>

                    {editable ? (
                      <PoCostLineItems
                        costCodes={props.costCodes}
                        heading="Costs"
                        initialLines={props.lines.map((line) => ({
                          title: line.title,
                          costCodeId: line.costCodeId,
                          costType: line.costType || "NONE",
                          unitCost: (line.amountCents / 100).toFixed(2),
                          quantity: "1",
                          unit: "",
                        }))}
                      />
                    ) : null}

                    <section className="flex flex-col gap-3">
                      <h2 className="text-sm font-semibold text-[var(--bt-text)]">QuickBooks</h2>
                      <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
                        <div className="space-y-2">
                          <label
                            className={`flex items-start gap-2 text-sm text-[var(--bt-text)] ${editable ? "cursor-pointer" : "cursor-default"}`}
                          >
                            <input
                              type="checkbox"
                              checked={sendToQuickBooks || Boolean(props.qboBillId)}
                              disabled={!editable || Boolean(props.qboBillId)}
                              onChange={(e) => setSendToQuickBooks(e.target.checked)}
                              className="mt-0.5"
                              style={{ accentColor: BT_LINK }}
                            />
                            <span>
                              Send to QuickBooks immediately upon save
                              <span className="mt-0.5 block text-[11px] text-[var(--bt-muted)]">
                                Check for labor/unpaid services; leave unchecked for materials already spent.
                              </span>
                            </span>
                          </label>
                          <label
                            className={`flex items-center gap-2 text-sm text-[var(--bt-text)] ${editable ? "cursor-pointer" : "cursor-default"}`}
                          >
                            <input
                              type="checkbox"
                              checked={billableToClient}
                              disabled={!editable}
                              onChange={(e) => setBillableToClient(e.target.checked)}
                              style={{ accentColor: BT_LINK }}
                            />
                            Mark as Billable to Client
                          </label>
                        </div>
                        <div>
                          <div className="text-xs font-medium text-[var(--bt-muted)]">QuickBooks Status</div>
                          <span
                            className="mt-1 inline-flex rounded-full px-2.5 py-1 text-xs font-semibold"
                            style={
                              props.qboBillId
                                ? { background: "#dcfce7", color: "#15803d" }
                                : { background: "#eef0f3", color: "#374151" }
                            }
                          >
                            {qbStatusLabel}
                          </span>
                          {props.qboBillId ? (
                            <div className="mt-1 text-[11px] text-[var(--bt-muted)]">Bill ID {props.qboBillId}</div>
                          ) : null}
                        </div>
                      </div>
                    </section>
                  </form>

                  {!editable ? (
                    <section className="flex flex-col gap-2">
                      <h2 className="text-sm font-semibold text-[var(--bt-text)]">Costs</h2>
                      <div className="overflow-x-auto rounded-md border" style={{ borderColor: "var(--bt-border)" }}>
                        <table className="w-full min-w-[40rem] text-left text-sm">
                          <thead>
                            <tr className="border-b bg-[#f9fafb] text-xs font-semibold text-[var(--bt-muted)]" style={{ borderColor: "var(--bt-border)" }}>
                              <th className="px-3 py-2">Title</th>
                              <th className="px-3 py-2">Cost code</th>
                              <th className="px-3 py-2">Cost type</th>
                              <th className="px-3 py-2 text-right">Builder cost</th>
                            </tr>
                          </thead>
                          <tbody>
                            {props.lines.length === 0 ? (
                              <tr>
                                <td colSpan={4} className="px-3 py-4 text-center text-xs text-[var(--bt-muted)]">
                                  No cost lines on this bill.
                                </td>
                              </tr>
                            ) : (
                              props.lines.map((line) => (
                                <tr key={line.id} className="border-b last:border-0" style={{ borderColor: "var(--bt-border)" }}>
                                  <td className="px-3 py-2 text-[var(--bt-text)]">{line.title}</td>
                                  <td className="px-3 py-2 text-[var(--bt-muted)]">{line.costCodeLabel}</td>
                                  <td className="px-3 py-2 text-[var(--bt-muted)]">{line.costTypeLabel}</td>
                                  <td className="px-3 py-2 text-right tabular-nums text-[var(--bt-text)]">
                                    {formatMoney(line.amountCents)}
                                  </td>
                                </tr>
                              ))
                            )}
                          </tbody>
                          <tfoot>
                            <tr className="bg-[#f3f4f6] font-semibold text-[var(--bt-text)]">
                              <td className="px-3 py-2" colSpan={3}>
                                Total
                              </td>
                              <td className="px-3 py-2 text-right tabular-nums">{formatMoney(totalCents)}</td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </section>
                  ) : null}

                  <section id="bill-approvals" className="flex flex-col gap-2">
                    <h2 className="text-sm font-semibold text-[var(--bt-text)]">Approvals</h2>
                    <div className="rounded-md border p-3" style={{ borderColor: "var(--bt-border)" }}>
                      <ApproversPanel
                        jobId={props.jobId}
                        billId={props.billId}
                        currentUserId={props.currentUserId}
                        staff={props.staff}
                        approvals={props.approvals}
                      />
                    </div>
                  </section>

                  <section className="flex flex-col gap-2">
                    <h2 className="text-sm font-semibold text-[var(--bt-text)]">Lien waivers</h2>
                    <p className="text-xs text-[var(--bt-muted)]">You can only send lien waivers to assigned subs/vendors</p>
                    <div className="space-y-2 rounded-md border p-3" style={{ borderColor: "var(--bt-border)" }}>
                      {LIEN_TEMPLATES.map((item) => {
                        const checked =
                          waiverTemplate === item.templateName ||
                          (item.key === "conditional" && /^conditional$/i.test(waiverTemplate)) ||
                          (item.key === "final" && /final/i.test(waiverTemplate)) ||
                          (item.key === "unconditional" &&
                            /unconditional/i.test(waiverTemplate) &&
                            !/final/i.test(waiverTemplate));
                        return (
                          <form key={item.key} action={lienAction} className="flex items-center gap-2">
                            <input type="hidden" name="jobId" value={props.jobId} />
                            <input type="hidden" name="billId" value={props.billId} />
                            <input type="hidden" name="templateName" value={item.templateName} />
                            <button
                              type="submit"
                              disabled={!editable || waiverReleased || applyingLien || checked}
                              className="flex w-full items-center gap-2 rounded px-1 py-1 text-left text-sm text-[var(--bt-text)] hover:bg-black/5 disabled:cursor-default disabled:hover:bg-transparent"
                              aria-pressed={checked}
                            >
                              <span
                                className="inline-flex h-4 w-4 items-center justify-center rounded border"
                                style={{
                                  borderColor: BT_LINK,
                                  background: checked ? BT_LINK : "transparent",
                                  color: "#fff",
                                  fontSize: 10,
                                }}
                                aria-hidden
                              >
                                {checked ? "✓" : ""}
                              </span>
                              {item.label}
                            </button>
                          </form>
                        );
                      })}
                      {lienState.error ? (
                        <p role="alert" className="text-xs text-red-600">
                          {lienState.error}
                        </p>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => setTab("lien")}
                        className="text-sm font-medium hover:underline"
                        style={{ color: BT_LINK }}
                      >
                        Manage on Lien Waiver tab →
                      </button>
                    </div>
                  </section>

                  <section className="flex flex-col gap-2 border-t pt-4" style={{ borderColor: "var(--bt-border)" }}>
                    <h2 className="text-sm font-semibold text-[var(--bt-text)]">Bill to client</h2>
                    <AddToInvoicePanel
                      jobId={props.jobId}
                      billId={props.billId}
                      draftInvoices={props.draftInvoices}
                      billedOn={props.billedOn}
                    />
                  </section>

                  <section id="bill-status-actions" className="flex flex-col gap-2">
                    <h2 className="text-sm font-semibold text-[var(--bt-text)]">Actions</h2>
                    <p className="text-[11px] text-[var(--bt-muted)]">Created by {props.createdByLabel}</p>
                    <StatusActions
                      jobId={props.jobId}
                      billId={props.billId}
                      status={props.approvalStatus}
                      isQboConnected={props.isQboConnected}
                      lineItems={props.lines.map((line) => ({
                        costType: line.costType,
                        amountCents: line.amountCents,
                      }))}
                    />
                  </section>
                </div>
              ) : (
                <div className="flex flex-col gap-4 p-4 sm:p-5">
                  <h2 className="text-sm font-semibold text-[var(--bt-text)]">Lien Waiver</h2>
                  <LienWaiverPanel
                    jobId={props.jobId}
                    billId={props.billId}
                    templates={props.lienTemplates}
                    waiver={props.waiver}
                  />
                </div>
              )}
            </div>

            <footer
              className="flex shrink-0 flex-col gap-2 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5"
              style={{ borderColor: "var(--bt-border)" }}
            >
              <div className="min-h-[1.25rem] text-xs">
                {deleteState.error || saveState.error ? (
                  <p role="alert" className="text-red-600">
                    {deleteState.error ?? saveState.error}
                  </p>
                ) : saveState.ok ? (
                  <span className="text-[var(--bt-success,#15803d)]">Saved</span>
                ) : (
                  <span className="text-[var(--bt-muted)]">Total {formatMoney(totalCents)}</span>
                )}
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                {canDelete ? (
                  <form action={deleteAction}>
                    <input type="hidden" name="jobId" value={props.jobId} />
                    <input type="hidden" name="billId" value={props.billId} />
                    <button
                      type="submit"
                      disabled={deleting}
                      className="rounded-md px-3 py-2 text-sm font-semibold text-[var(--bt-danger)] hover:bg-red-50 disabled:opacity-50"
                    >
                      {deleting ? "Deleting…" : "Delete"}
                    </button>
                  </form>
                ) : null}
                <button
                  type="button"
                  onClick={close}
                  className="rounded-md border px-3 py-2 text-sm font-semibold text-[var(--bt-text)] hover:bg-black/5"
                  style={{ borderColor: "var(--bt-border)" }}
                >
                  Close
                </button>
                {editable ? (
                  <button
                    type="submit"
                    form={EDIT_FORM_ID}
                    disabled={saving}
                    className="rounded-md px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                    style={{ background: props.approvalStatus === "APPROVED" ? BT_NAVY : BT_LINK }}
                  >
                    {saving ? "Saving…" : "Save"}
                  </button>
                ) : null}
              </div>
            </footer>
          </div>
        </div>
      </div>
    </div>
  );
}
