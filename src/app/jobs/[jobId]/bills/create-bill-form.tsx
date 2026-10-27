"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { PoCostLineItems } from "@/components/financial/PoCostLineItems";
import type { CostCodeOption } from "@/components/financial/CostCodeLineItems";
import { CloseIcon } from "@/components/shell/icons";

import { createBillAction, type ActionState } from "./actions";

const INITIAL: ActionState = {};

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

/**
 * Buildertrend Bill create modal — General Information, Cost table, Internal notes,
 * Save. Mirrors the PO create layout so staff aren't context-switching form shapes.
 */
export function CreateBillForm({
  jobId,
  jobName,
  costCodes,
  purchaseOrders,
  vendors,
  scheduleItems,
  onClose,
}: {
  jobId: string;
  jobName: string;
  costCodes: readonly CostCodeOption[];
  purchaseOrders: readonly PurchaseOrderOption[];
  vendors: readonly VendorOption[];
  scheduleItems: readonly ScheduleOption[];
  onClose?: () => void;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(createBillAction, INITIAL);
  const [vendorId, setVendorId] = useState("");
  const [vendorName, setVendorName] = useState("");
  const [purchaseOrderId, setPurchaseOrderId] = useState("");
  const [completionMode, setCompletionMode] = useState<"none" | "schedule">("none");
  const [linkedScheduleItemId, setLinkedScheduleItemId] = useState("");

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

  return (
    <form action={formAction} className="flex max-h-[92vh] flex-col">
      <input type="hidden" name="jobId" value={jobId} />
      <input type="hidden" name="vendorName" value={vendorName} />
      <input type="hidden" name="completionMode" value={completionMode} />

      <header
        className="flex shrink-0 items-start justify-between gap-3 border-b px-4 py-3 sm:px-5"
        style={{ borderColor: "var(--bt-border)" }}
      >
        <div className="min-w-0">
          <div className="truncate text-xs text-[var(--bt-muted)]">{jobName}</div>
          <h2 className="text-base font-semibold text-[var(--bt-text)]">Bill</h2>
        </div>
        {onClose ? (
          <button type="button" onClick={onClose} aria-label="Close" className="rounded p-1 text-[var(--bt-muted)] hover:bg-black/5">
            <CloseIcon className="h-4 w-4" />
          </button>
        ) : null}
      </header>

      <div className="grid min-h-0 flex-1 overflow-y-auto lg:grid-cols-[minmax(0,1fr)_14rem]">
        <div className="flex flex-col gap-5 p-4 sm:p-5">
          <section className="flex flex-col gap-3">
            <h3 className="text-sm font-semibold text-[var(--bt-text)]">General Information</h3>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-sm">
                <span className="text-xs font-medium text-[var(--bt-muted)]">Bill #</span>
                <input
                  name="billNumber"
                  placeholder="Vendor invoice #"
                  className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]"
                  style={{ borderColor: "var(--bt-border)" }}
                />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="text-xs font-medium text-[var(--bt-muted)]">Title</span>
                <input
                  name="title"
                  placeholder="Receipt title…"
                  className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]"
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
                  className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]"
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
                    className="mt-1 rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]"
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
                  className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]"
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
                  className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]"
                  style={{ borderColor: "var(--bt-border)" }}
                />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="text-xs font-medium text-[var(--bt-muted)]">Due date</span>
                <input
                  type="date"
                  name="dueOn"
                  className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]"
                  style={{ borderColor: "var(--bt-border)" }}
                />
              </label>
            </div>

            <div className="grid gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium text-[var(--bt-muted)]">Link to Schedule</span>
                <label className="flex items-center gap-2 text-sm text-[var(--bt-text)]">
                  <input
                    type="checkbox"
                    checked={completionMode === "schedule"}
                    onChange={(event) => setCompletionMode(event.target.checked ? "schedule" : "none")}
                    className="rounded border"
                    style={{ borderColor: "var(--bt-border)" }}
                  />
                  Link this bill to a schedule item
                </label>
              </div>
              {completionMode === "schedule" ? (
                <label className="grid gap-1 text-sm sm:max-w-md">
                  <span className="text-xs font-medium text-[var(--bt-muted)]">Schedule item</span>
                  <select
                    name="linkedScheduleItemId"
                    value={linkedScheduleItemId}
                    onChange={(event) => setLinkedScheduleItemId(event.target.value)}
                    className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]"
                    style={{ borderColor: "var(--bt-border)" }}
                  >
                    <option value="">Choose schedule item…</option>
                    {scheduleItems.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.title}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
            </div>
          </section>

          <section>
            <h3 className="text-sm font-semibold text-[var(--bt-text)]">Attachments</h3>
            <p className="mt-1 text-xs text-[var(--bt-muted)]">
              Save the bill first, then attach receipts on the detail page — or drop files on the Bills inbox.
            </p>
          </section>

          <PoCostLineItems costCodes={costCodes} heading="Cost" />
        </div>

        <aside
          className="border-t bg-black/[0.02] p-4 lg:border-l lg:border-t-0"
          style={{ borderColor: "var(--bt-border)" }}
        >
          <h3 className="text-sm font-semibold text-[var(--bt-text)]">Internal Only</h3>
          <p className="mt-1 text-[10px] text-[var(--bt-muted)]">Staff notes — not shown on client/sub portals.</p>
          <textarea
            name="description"
            rows={12}
            placeholder="Internal notes"
            className="mt-3 w-full rounded border bg-[var(--bt-panel-bg)] px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]"
            style={{ borderColor: "var(--bt-border)" }}
          />
        </aside>
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
        <button
          type="submit"
          disabled={pending}
          className="rounded px-4 py-2 text-sm font-semibold text-[var(--bt-on-primary)] disabled:opacity-50"
          style={{ background: "var(--bt-primary)" }}
        >
          {pending ? "Saving…" : "Save"}
        </button>
      </footer>
    </form>
  );
}
