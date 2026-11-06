"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { PoCostLineItems } from "@/components/financial/PoCostLineItems";
import type { CostCodeOption } from "@/components/financial/CostCodeLineItems";
import { CloseIcon } from "@/components/shell/icons";

import { createBillAction, type ActionState } from "./actions";

const INITIAL: ActionState = {};

const BT_LINK = "#1F4ECD";
const BT_NAVY = "#163a8a";

export interface PurchaseOrderOption {
  readonly id: string;
  readonly poNumber: string;
  readonly title: string | null;
  readonly vendorId: string | null;
  readonly vendorName: string;
}

export interface VendorOption {
  readonly id: string;
  readonly name: string;
}

export interface ScheduleOption {
  readonly id: string;
  readonly title: string;
}

export interface StaffOption {
  readonly id: string;
  readonly name: string;
}

/**
 * Buildertrend Bill create modal — Document rail, Costs, Approvals, Lien waivers,
 * QuickBooks (Send immediately + Billable + status), BT footer actions.
 */
export function CreateBillForm({
  jobId,
  jobName,
  costCodes,
  purchaseOrders,
  vendors,
  scheduleItems,
  staffUsers,
  isQboConnected,
  qboBillPushEnabled,
  onClose,
}: {
  jobId: string;
  jobName: string;
  costCodes: readonly CostCodeOption[];
  purchaseOrders: readonly PurchaseOrderOption[];
  vendors: readonly VendorOption[];
  scheduleItems: readonly ScheduleOption[];
  staffUsers: readonly StaffOption[];
  isQboConnected: boolean;
  qboBillPushEnabled: boolean;
  onClose?: () => void;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(createBillAction, INITIAL);
  const [vendorId, setVendorId] = useState("");
  const [vendorName, setVendorName] = useState("");
  const [purchaseOrderId, setPurchaseOrderId] = useState("");
  const [completionMode, setCompletionMode] = useState<"none" | "schedule">("none");
  const [linkedScheduleItemId, setLinkedScheduleItemId] = useState("");
  const [documentOpen, setDocumentOpen] = useState(false);
  const [approverIds, setApproverIds] = useState<string[]>([]);
  const [lienConditional, setLienConditional] = useState(false);
  const [lienUnconditional, setLienUnconditional] = useState(false);
  const [lienFinal, setLienFinal] = useState(false);
  const [sendToQuickBooks, setSendToQuickBooks] = useState(false);
  const [billableToClient, setBillableToClient] = useState(false);

  const qbPaused = isQboConnected && !qboBillPushEnabled;

  useEffect(() => {
    if (!state.ok || !state.billId) return;
    onClose?.();
    router.push(`/jobs/${jobId}/bills/${state.billId}`);
    router.refresh();
  }, [state.ok, state.billId, jobId, onClose, router]);

  function onPurchaseOrderChange(nextId: string) {
    setPurchaseOrderId(nextId);
    const po = purchaseOrders.find((row) => row.id === nextId);
    if (!po) return;
    if (po.vendorId) {
      setVendorId(po.vendorId);
      setVendorName(po.vendorName);
    } else if (po.vendorName) {
      setVendorId("");
      setVendorName(po.vendorName);
    }
  }

  function onVendorChange(nextId: string) {
    setVendorId(nextId);
    const vendor = vendors.find((row) => row.id === nextId);
    if (vendor) setVendorName(vendor.name);
  }

  function toggleApprover(id: string) {
    setApproverIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  const qbStatusLabel = useMemo(() => {
    if (!sendToQuickBooks) return "Not Billed";
    if (qbPaused) return "Queued (push paused)";
    if (!isQboConnected) return "Not connected";
    return "Will send on ready";
  }, [sendToQuickBooks, qbPaused, isQboConnected]);

  return (
    <form action={formAction} className="flex max-h-[92vh] flex-col">
      <input type="hidden" name="jobId" value={jobId} />
      <input type="hidden" name="vendorName" value={vendorName} />
      <input type="hidden" name="completionMode" value={completionMode} />
      <input type="hidden" name="sendToQuickBooks" value={sendToQuickBooks ? "true" : "false"} />
      <input type="hidden" name="billableToClient" value={billableToClient ? "true" : "false"} />
      <input type="hidden" name="approverIds" value={approverIds.join(",")} />
      <input
        type="hidden"
        name="lienWaiverKinds"
        value={[lienConditional ? "conditional" : "", lienUnconditional ? "unconditional" : "", lienFinal ? "final" : ""]
          .filter(Boolean)
          .join(",")}
      />
      {!sendToQuickBooks ? (
        <input type="hidden" name="quickBooksSkipReason" value="Skipped QuickBooks on create" />
      ) : null}

      <header
        className="flex shrink-0 items-start justify-between gap-3 border-b px-4 py-3 sm:px-5"
        style={{ borderColor: "var(--bt-border)" }}
      >
        <div className="min-w-0">
          <div className="truncate text-xs text-[var(--bt-muted)]">{jobName}</div>
          <h2 className="text-base font-semibold text-[var(--bt-text)]">Bill</h2>
        </div>
        <div className="flex items-center gap-1">
          {onClose ? (
            <button type="button" onClick={onClose} aria-label="Close" className="rounded-md p-1.5 text-[var(--bt-muted)] hover:bg-black/5">
              <CloseIcon className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      </header>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Document rail — BT left chrome */}
        <div
          className={`flex shrink-0 flex-col border-r bg-[var(--bt-panel-bg-muted)] transition-all ${documentOpen ? "w-56" : "w-9"}`}
          style={{ borderColor: "var(--bt-border)" }}
        >
          <button
            type="button"
            onClick={() => setDocumentOpen((o) => !o)}
            className="flex h-full min-h-[8rem] items-center justify-center px-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--bt-muted)] hover:bg-black/5"
            aria-expanded={documentOpen}
            aria-label="Document attachments"
            style={{ writingMode: documentOpen ? undefined : "vertical-rl", transform: documentOpen ? undefined : "rotate(180deg)" }}
          >
            {documentOpen ? "Document ▾" : "Document ›"}
          </button>
          {documentOpen ? (
            <div className="space-y-2 border-t p-3 text-xs text-[var(--bt-muted)]" style={{ borderColor: "var(--bt-border)" }}>
              <p>Attach receipts after save on the bill detail page, or forward to Email to Inbox.</p>
            </div>
          ) : null}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="flex flex-col gap-5 p-4 sm:p-5">
            <section className="flex flex-col gap-3">
              <h3 className="text-sm font-semibold text-[var(--bt-text)]">General Information</h3>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1 text-sm">
                  <span className="text-xs font-medium text-[var(--bt-muted)]">Bill #</span>
                  <input
                    name="billNumber"
                    placeholder="Vendor invoice #"
                    className="rounded-md border px-3 py-2 text-sm outline-none focus:border-[var(--bt-link,#1F4ECD)]"
                    style={{ borderColor: "var(--bt-border)" }}
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  <span className="text-xs font-medium text-[var(--bt-muted)]">Title</span>
                  <input
                    name="title"
                    placeholder="Bill title…"
                    className="rounded-md border px-3 py-2 text-sm outline-none focus:border-[var(--bt-link,#1F4ECD)]"
                    style={{ borderColor: "var(--bt-border)" }}
                  />
                </label>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1 text-sm">
                  <span className="text-xs font-medium text-[var(--bt-muted)]">Assigned to</span>
                  <select
                    name="vendorId"
                    value={vendorId}
                    onChange={(event) => onVendorChange(event.target.value)}
                    className="rounded-md border px-3 py-2 text-sm outline-none focus:border-[var(--bt-link,#1F4ECD)]"
                    style={{ borderColor: "var(--bt-border)" }}
                  >
                    <option value="">Type or pick vendor…</option>
                    {vendors.map((vendor) => (
                      <option key={vendor.id} value={vendor.id}>
                        {vendor.name}
                      </option>
                    ))}
                  </select>
                  {!vendorId ? (
                    <input
                      value={vendorName}
                      onChange={(event) => setVendorName(event.target.value)}
                      placeholder="Vendor name"
                      required
                      className="mt-1 rounded-md border px-3 py-2 text-sm outline-none focus:border-[var(--bt-link,#1F4ECD)]"
                      style={{ borderColor: "var(--bt-border)" }}
                    />
                  ) : null}
                </label>

                <label className="grid gap-1 text-sm">
                  <span className="text-xs font-medium text-[var(--bt-muted)]">Against PO</span>
                  <select
                    name="purchaseOrderId"
                    value={purchaseOrderId}
                    onChange={(event) => onPurchaseOrderChange(event.target.value)}
                    className="rounded-md border px-3 py-2 text-sm outline-none focus:border-[var(--bt-link,#1F4ECD)]"
                    style={{ borderColor: "var(--bt-border)" }}
                  >
                    <option value="">None</option>
                    {purchaseOrders.map((po) => (
                      <option key={po.id} value={po.id}>
                        {po.poNumber}
                        {po.title ? ` — ${po.title}` : ""}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1 text-sm">
                  <span className="text-xs font-medium text-[var(--bt-muted)]">Bill date</span>
                  <input
                    type="date"
                    name="issuedOn"
                    className="rounded-md border px-3 py-2 text-sm outline-none focus:border-[var(--bt-link,#1F4ECD)]"
                    style={{ borderColor: "var(--bt-border)" }}
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  <span className="text-xs font-medium text-[var(--bt-muted)]">Due date</span>
                  <input
                    type="date"
                    name="dueOn"
                    className="rounded-md border px-3 py-2 text-sm outline-none focus:border-[var(--bt-link,#1F4ECD)]"
                    style={{ borderColor: "var(--bt-border)" }}
                  />
                </label>
              </div>

              <div className="grid gap-2">
                <label className="flex items-center gap-2 text-sm text-[var(--bt-text)]">
                  <input
                    type="checkbox"
                    checked={completionMode === "schedule"}
                    onChange={(event) => setCompletionMode(event.target.checked ? "schedule" : "none")}
                    className="rounded border"
                    style={{ borderColor: "var(--bt-border)", accentColor: BT_LINK }}
                  />
                  Link this bill to a schedule item
                </label>
                {completionMode === "schedule" ? (
                  <select
                    name="linkedScheduleItemId"
                    value={linkedScheduleItemId}
                    onChange={(event) => setLinkedScheduleItemId(event.target.value)}
                    className="max-w-md rounded-md border px-3 py-2 text-sm outline-none focus:border-[var(--bt-link,#1F4ECD)]"
                    style={{ borderColor: "var(--bt-border)" }}
                  >
                    <option value="">Choose schedule item…</option>
                    {scheduleItems.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.title}
                      </option>
                    ))}
                  </select>
                ) : null}
              </div>

              <label className="grid gap-1 text-sm">
                <span className="text-xs font-medium text-[var(--bt-muted)]">Description</span>
                <textarea
                  name="description"
                  rows={3}
                  placeholder="Notes / description…"
                  className="rounded-md border px-3 py-2 text-sm outline-none focus:border-[var(--bt-link,#1F4ECD)]"
                  style={{ borderColor: "var(--bt-border)" }}
                />
              </label>
            </section>

            <PoCostLineItems costCodes={costCodes} heading="Costs" />

            <section className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold text-[var(--bt-text)]">Approvals</h3>
              <div className="rounded-md border p-3" style={{ borderColor: "var(--bt-border)" }}>
                <div className="mb-2 text-xs font-semibold text-[var(--bt-muted)]">Approvers</div>
                {staffUsers.length === 0 ? (
                  <p className="text-xs text-[var(--bt-muted)]">No staff users available to assign.</p>
                ) : (
                  <ul className="mb-2 max-h-28 space-y-1 overflow-y-auto">
                    {staffUsers.map((user) => (
                      <li key={user.id}>
                        <label className="flex cursor-pointer items-center gap-2 text-sm text-[var(--bt-text)]">
                          <input
                            type="checkbox"
                            checked={approverIds.includes(user.id)}
                            onChange={() => toggleApprover(user.id)}
                            style={{ accentColor: BT_LINK }}
                          />
                          {user.name}
                        </label>
                      </li>
                    ))}
                  </ul>
                )}
                <button
                  type="button"
                  onClick={() => {
                    const first = staffUsers.find((u) => !approverIds.includes(u.id));
                    if (first) toggleApprover(first.id);
                  }}
                  className="text-sm font-medium hover:underline"
                  style={{ color: BT_LINK }}
                >
                  + Add approver
                </button>
              </div>
            </section>

            <section className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold text-[var(--bt-text)]">Lien waivers</h3>
              <p className="text-xs text-[var(--bt-muted)]">You can only send lien waivers to assigned subs/vendors</p>
              <div className="space-y-2 rounded-md border p-3" style={{ borderColor: "var(--bt-border)" }}>
                <label className="flex items-center gap-2 text-sm text-[var(--bt-text)]">
                  <input type="checkbox" checked={lienConditional} onChange={(e) => setLienConditional(e.target.checked)} style={{ accentColor: BT_LINK }} />
                  Conditional
                </label>
                <label className="flex items-center gap-2 text-sm text-[var(--bt-text)]">
                  <input type="checkbox" checked={lienUnconditional} onChange={(e) => setLienUnconditional(e.target.checked)} style={{ accentColor: BT_LINK }} />
                  Unconditional
                </label>
                <label className="flex items-center gap-2 text-sm text-[var(--bt-text)]">
                  <input type="checkbox" checked={lienFinal} onChange={(e) => setLienFinal(e.target.checked)} style={{ accentColor: BT_LINK }} />
                  Final unconditional
                </label>
              </div>
            </section>

            <section className="flex flex-col gap-3">
              <h3 className="text-sm font-semibold text-[var(--bt-text)]">QuickBooks</h3>
              <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
                <div className="space-y-2">
                  <label className="flex cursor-pointer items-start gap-2 text-sm text-[var(--bt-text)]">
                    <input
                      type="checkbox"
                      checked={sendToQuickBooks}
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
                  <label className="flex cursor-pointer items-center gap-2 text-sm text-[var(--bt-text)]">
                    <input
                      type="checkbox"
                      checked={billableToClient}
                      onChange={(e) => setBillableToClient(e.target.checked)}
                      style={{ accentColor: BT_LINK }}
                    />
                    Mark as Billable to Client
                  </label>
                  {qbPaused && sendToQuickBooks ? (
                    <p className="rounded-md border px-2 py-1.5 text-[11px] text-[var(--bt-muted)]" style={{ borderColor: "var(--bt-hazard)", background: "color-mix(in srgb, var(--bt-hazard) 8%, transparent)" }}>
                      QuickBooks bill push is paused (`QBO_BILL_PUSH_ENABLED`). Your intent is saved; nothing is pushed until Money re-enables push.
                    </p>
                  ) : null}
                  {!isQboConnected && sendToQuickBooks ? (
                    <p className="text-[11px] text-[var(--bt-muted)]">QuickBooks isn&apos;t connected — intent is saved for when it is.</p>
                  ) : null}
                </div>
                <div>
                  <div className="text-xs font-medium text-[var(--bt-muted)]">QuickBooks Status</div>
                  <span
                    className="mt-1 inline-flex rounded-full px-2.5 py-1 text-xs font-semibold"
                    style={{ background: "#eef0f3", color: "#374151" }}
                  >
                    {qbStatusLabel}
                  </span>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>

      <footer
        className="flex shrink-0 flex-col gap-2 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5"
        style={{ borderColor: "var(--bt-border)" }}
      >
        <div className="min-h-[1.25rem] text-xs">
          {state.error ? (
            <p role="alert" className="text-red-600">
              {state.error}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              disabled={pending}
              className="rounded-md px-3 py-2 text-sm font-semibold text-[var(--bt-danger)] hover:bg-red-50 disabled:opacity-50"
            >
              Delete
            </button>
          ) : null}
          <button
            type="submit"
            name="saveIntent"
            value="draft"
            disabled={pending}
            className="rounded-md border px-3 py-2 text-sm font-semibold text-[var(--bt-text)] hover:bg-black/5 disabled:opacity-50"
            style={{ borderColor: "var(--bt-border)" }}
          >
            {pending ? "Saving…" : "Save draft"}
          </button>
          <button
            type="submit"
            name="saveIntent"
            value="job"
            disabled={pending}
            className="rounded-md px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
            style={{ background: BT_LINK }}
          >
            {pending ? "Saving…" : "Save to Job"}
          </button>
          <button
            type="submit"
            name="saveIntent"
            value="ready"
            disabled={pending}
            className="rounded-md px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
            style={{ background: BT_NAVY }}
            title="Mark Ready for Payment"
          >
            {pending ? "Saving…" : (
              <>
                <span className="sm:hidden">Ready for Payment</span>
                <span className="hidden sm:inline">Mark Ready for Payment</span>
              </>
            )}
          </button>
        </div>
      </footer>
    </form>
  );
}
