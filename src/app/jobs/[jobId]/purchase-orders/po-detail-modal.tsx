"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { ScopeRichText } from "@/components/financial/ScopeRichText";
import {
  CloseIcon,
  GearIcon,
  HistoryIcon,
  InfoIcon,
  MaximizeIcon,
  MenuIcon,
} from "@/components/shell/icons";
import { calendarDateEastern, formatMoney } from "@/lib/format";
import {
  formatPoNumberDisplay,
  formatPoStatusLabel,
  formatWorkStatusLabel,
} from "@/lib/purchase-orders/display";

import {
  setWorkStatusAction,
  updatePurchaseOrderAction,
  type ActionState,
} from "./actions";
import type { ScheduleOption, VendorOption } from "./create-po-form";
import { purchaseOrderDetailHref, type PurchaseOrderRow } from "./purchase-orders-grid";
import { PO_STATUS_STYLE, WORK_STATUS_STYLE } from "./status-styles";

const INITIAL: ActionState = {};

function SendIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden>
      <path d="M3.1 2.3a1 1 0 0 1 1.08-.12l13 6.5a1 1 0 0 1 0 1.84l-13 6.5A1 1 0 0 1 2 16.5v-4.3a1 1 0 0 1 .7-.95l6.55-2.05a.25.25 0 0 0 0-.48L2.7 6.67A1 1 0 0 1 2 5.72V3.1a1 1 0 0 1 1.1-.8Z" />
    </svg>
  );
}

function toDateInputValue(iso: string | null): string {
  if (!iso) return "";
  try {
    return calendarDateEastern(new Date(iso));
  } catch {
    return "";
  }
}

/**
 * Buildertrend pencil-modal for an existing Purchase Order — General / Scope on
 * the left, Work Status + PO Status + Internal Notes on the right, Save + Send
 * in the footer. Pop-out opens the full detail page.
 *
 * Color language follows BT (grey Draft, green Approved, amber Work Incomplete,
 * green Work Complete) rather than monochrome teal.
 */
export function PurchaseOrderDetailModal({
  row,
  vendors,
  scheduleItems,
  onClose,
}: {
  row: PurchaseOrderRow;
  vendors: readonly VendorOption[];
  scheduleItems: readonly ScheduleOption[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(updatePurchaseOrderAction, INITIAL);
  const [workState, workAction, workPending] = useActionState(setWorkStatusAction, INITIAL);
  const [intent, setIntent] = useState<"save" | "send">("save");
  const [materialsOnly, setMaterialsOnly] = useState(row.materialsOnly);
  const [vendorId, setVendorId] = useState(row.vendorId ?? "");
  const [completionMode, setCompletionMode] = useState<"date" | "schedule">(
    row.linkedScheduleItemId ? "schedule" : "date",
  );
  const [linkedScheduleItemId, setLinkedScheduleItemId] = useState(row.linkedScheduleItemId ?? "");
  const [menuOpen, setMenuOpen] = useState(false);

  const statusStyle = PO_STATUS_STYLE[row.status] ?? PO_STATUS_STYLE.DRAFT;
  const workStyle = WORK_STATUS_STYLE[row.workStatus] ?? WORK_STATUS_STYLE.NOT_COMPLETE;
  const workComplete = row.workStatus === "WORK_COMPLETE";
  const canEdit = row.status === "DRAFT" || row.status === "DECLINED" || row.status === "PENDING_APPROVAL";
  const canSend = row.status === "DRAFT" || row.status === "DECLINED";
  const selectedVendor = vendors.find((vendor) => vendor.id === vendorId) ?? null;
  const displayPo = formatPoNumberDisplay(row.poNumber, row.poSuffix);
  const detailHref = purchaseOrderDetailHref(row);

  useEffect(() => {
    if (workState.ok) router.refresh();
  }, [workState.ok, router]);

  useEffect(() => {
    if (!state.ok) return;
    router.refresh();
    if (intent === "save" && !state.error) onClose();
  }, [state.ok, state.error, intent, onClose, router]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-3">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        className="relative flex max-h-[96vh] w-full max-w-5xl flex-col overflow-hidden rounded-t-lg bg-[var(--bt-panel-bg)] shadow-xl sm:max-h-[92vh] sm:rounded-lg"
        role="dialog"
        aria-modal="true"
        aria-label="Purchase Order"
      >
        <form action={formAction} className="flex min-h-0 flex-1 flex-col">
          <input type="hidden" name="jobId" value={row.jobId} />
          <input type="hidden" name="purchaseOrderId" value={row.id} />
          <input type="hidden" name="intent" value={intent} />
          <input type="hidden" name="storedPoNumber" value={row.poNumber} />
          <input type="hidden" name="vendorName" value={selectedVendor?.name ?? row.vendorName} />
          <input type="hidden" name="completionMode" value={completionMode} />

          <header
            className="flex shrink-0 items-start justify-between gap-3 border-b px-4 py-3 sm:px-5"
            style={{ borderColor: "var(--bt-border)" }}
          >
            <div className="min-w-0">
              <div className="truncate text-xs text-[var(--bt-muted)]">{row.jobName}</div>
              <h2 className="text-lg font-semibold text-[var(--bt-text)]">Purchase Order</h2>
            </div>
            <div className="flex shrink-0 items-center gap-0.5">
              <Link
                href={detailHref}
                aria-label="Open full page"
                title="Open full page"
                className="rounded p-1.5 text-[#0ea5e9] hover:bg-sky-50"
              >
                <MaximizeIcon className="h-4 w-4" />
              </Link>
              <Link
                href={`${detailHref}#history`}
                aria-label="History"
                title="History"
                className="rounded p-1.5 text-[#d97706] hover:bg-amber-50"
              >
                <HistoryIcon className="h-4 w-4" />
              </Link>
              <span className="rounded p-1.5 text-[#64748b]" title="Settings" aria-hidden>
                <GearIcon className="h-4 w-4" />
              </span>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="rounded p-1.5 text-[var(--bt-muted)] hover:bg-black/5"
              >
                <CloseIcon className="h-4 w-4" />
              </button>
            </div>
          </header>

          <div className="grid min-h-0 flex-1 overflow-y-auto lg:grid-cols-[minmax(0,1fr)_15rem]">
            <div className="flex flex-col gap-5 p-4 sm:p-5">
              <section className="relative flex flex-col gap-3">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-[var(--bt-text)]">General</h3>
                  <span
                    className="rounded px-2 py-0.5 text-[10px] font-semibold"
                    style={{ background: statusStyle.bg, color: statusStyle.text }}
                  >
                    {formatPoStatusLabel(row.status)}
                  </span>
                </div>

                <div className="flex flex-wrap items-end justify-between gap-3">
                  <label className="grid min-w-[8rem] gap-1 text-sm">
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-[var(--bt-muted)]">
                      Purchase Order # <InfoIcon className="h-3 w-3 text-sky-500" />
                    </span>
                    <input
                      name="poNumber"
                      defaultValue={displayPo}
                      disabled={!canEdit}
                      className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)] disabled:opacity-60"
                      style={{ borderColor: "var(--bt-border)" }}
                    />
                  </label>
                  <div className="text-right">
                    <div className="text-xs font-medium text-[var(--bt-muted)]">Total Cost</div>
                    <div className="text-base font-semibold text-[var(--bt-text)]">{formatMoney(row.totalCents)}</div>
                  </div>
                </div>

                <label className="grid gap-1 text-sm">
                  <span className="text-xs font-medium text-[var(--bt-muted)]">Title</span>
                  <input
                    name="title"
                    defaultValue={row.title ?? ""}
                    disabled={!canEdit}
                    className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)] disabled:opacity-60"
                    style={{ borderColor: "var(--bt-border)" }}
                  />
                </label>

                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                  <label className="grid gap-1 text-sm">
                    <span className="text-xs font-medium text-[var(--bt-muted)]">Assigned to</span>
                    <select
                      name="vendorId"
                      value={vendorId}
                      onChange={(event) => setVendorId(event.target.value)}
                      disabled={!canEdit}
                      className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)] disabled:opacity-60"
                      style={{ borderColor: "var(--bt-border)" }}
                    >
                      <option value="">Unassigned</option>
                      {vendors.map((vendor) => (
                        <option key={vendor.id} value={vendor.id}>
                          {vendor.name}
                          {vendor.email ? "" : " (no email)"}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex items-center gap-2 pb-2 text-sm text-[var(--bt-text)]">
                    <input
                      type="checkbox"
                      name="materialsOnly"
                      value="true"
                      checked={materialsOnly}
                      disabled={!canEdit}
                      onChange={(event) => setMaterialsOnly(event.target.checked)}
                      className="rounded border"
                      style={{ borderColor: "var(--bt-border)" }}
                    />
                    Materials Only
                  </label>
                </div>

                <div className="grid gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-medium text-[var(--bt-muted)]">Scheduled Completion</span>
                    <div className="inline-flex rounded border p-0.5" style={{ borderColor: "var(--bt-border)" }}>
                      <button
                        type="button"
                        disabled={!canEdit}
                        onClick={() => setCompletionMode("date")}
                        className="rounded px-2.5 py-1 text-xs font-semibold disabled:opacity-50"
                        style={{
                          background: completionMode === "date" ? "var(--bt-primary)" : "transparent",
                          color: completionMode === "date" ? "var(--bt-on-primary)" : "var(--bt-text)",
                        }}
                      >
                        Choose date
                      </button>
                      <button
                        type="button"
                        disabled={!canEdit}
                        onClick={() => setCompletionMode("schedule")}
                        className="rounded px-2.5 py-1 text-xs font-semibold disabled:opacity-50"
                        style={{
                          background: completionMode === "schedule" ? "var(--bt-primary)" : "transparent",
                          color: completionMode === "schedule" ? "var(--bt-on-primary)" : "var(--bt-text)",
                        }}
                      >
                        Link to Schedule
                      </button>
                    </div>
                  </div>

                  {completionMode === "date" ? (
                    <label className="grid max-w-xs gap-1 text-sm">
                      <span className="text-xs font-medium text-[var(--bt-muted)]">Completion Date</span>
                      <input
                        type="date"
                        name="scheduledCompletionOn"
                        defaultValue={toDateInputValue(row.scheduledCompletionOn)}
                        disabled={!canEdit}
                        className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)] disabled:opacity-60"
                        style={{ borderColor: "var(--bt-border)" }}
                      />
                      <input type="hidden" name="completedOn" defaultValue={toDateInputValue(row.completedOn)} />
                    </label>
                  ) : (
                    <label className="grid max-w-md gap-1 text-sm">
                      <span className="text-xs font-medium text-[var(--bt-muted)]">Schedule item</span>
                      <select
                        name="linkedScheduleItemId"
                        value={linkedScheduleItemId}
                        onChange={(event) => setLinkedScheduleItemId(event.target.value)}
                        disabled={!canEdit}
                        className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)] disabled:opacity-60"
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
                  )}
                </div>
              </section>

              {canEdit ? (
                <ScopeRichText defaultValue={row.scopeOfWork ?? ""} />
              ) : (
                <section className="grid gap-1">
                  <h3 className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--bt-text)]">
                    Scope of Work <InfoIcon className="h-3.5 w-3.5 text-sky-500" />
                  </h3>
                  <div
                    className="min-h-[10rem] whitespace-pre-wrap rounded border px-3 py-2 text-sm text-[var(--bt-text)]"
                    style={{ borderColor: "var(--bt-border)" }}
                  >
                    {row.scopeOfWork?.trim() ? row.scopeOfWork : <span className="text-[var(--bt-muted)]">—</span>}
                  </div>
                </section>
              )}
            </div>

            <aside
              className="flex flex-col gap-4 border-t bg-[#f3f4f6] p-4 lg:border-l lg:border-t-0"
              style={{ borderColor: "var(--bt-border)" }}
            >
              <section className="rounded border bg-white p-3" style={{ borderColor: "var(--bt-border)" }}>
                <h3 className="text-sm font-semibold text-[var(--bt-text)]">Work Status</h3>
                <div className="mt-2">
                  <span
                    className="inline-block rounded px-2 py-0.5 text-[10px] font-semibold"
                    style={{
                      background: workComplete ? workStyle.bg : "#f5e6c8",
                      color: workComplete ? workStyle.text : "#92400e",
                    }}
                  >
                    {workComplete ? formatWorkStatusLabel("WORK_COMPLETE") : "Work Incomplete"}
                  </span>
                </div>
                {/* formAction routes this submit to setWorkStatusAction without a nested <form>. */}
                <button
                  type="submit"
                  formAction={workAction}
                  name="workComplete"
                  value={workComplete ? "false" : "true"}
                  disabled={workPending}
                  className="mt-3 w-full rounded border bg-white px-3 py-1.5 text-xs font-semibold text-[var(--bt-text)] disabled:opacity-50 hover:bg-black/5"
                  style={{ borderColor: "var(--bt-border)" }}
                >
                  {workPending ? "Working…" : workComplete ? "Reopen Work" : "Mark Work Complete"}
                </button>
              </section>

              <section className="rounded border bg-white p-3" style={{ borderColor: "var(--bt-border)" }}>
                <h3 className="text-sm font-semibold text-[var(--bt-text)]">Purchase Order Status</h3>
                <div className="mt-3 h-2.5 w-full overflow-hidden rounded-sm bg-[#d1d5db]">
                  <div
                    className="h-full"
                    style={{
                      width: `${Math.min(100, Math.max(0, row.billedPercent))}%`,
                      background: row.billedPercent > 0 ? "var(--bt-badge-qb-bg)" : "transparent",
                    }}
                  />
                </div>
                <div className="mt-2 flex items-center justify-between gap-2 rounded border border-[#e5e7eb] bg-[#f9fafb] px-2 py-1.5 text-xs">
                  <span className="font-semibold text-[var(--bt-text)]">{row.billedPercent}%</span>
                  <span className="text-[var(--bt-muted)]">Outstanding: {formatMoney(row.outstandingCents)}</span>
                </div>
                <p className="mt-2 text-[10px] text-[var(--bt-muted)]">
                  {row.billedPercent === 0
                    ? "No Payments have been made or requested."
                    : `${row.billedPercent}% billed against this purchase order.`}
                </p>
              </section>

              <section>
                <h3 className="text-sm font-semibold text-[var(--bt-text)]">Internal Only</h3>
                <label className="mt-2 grid gap-1 text-sm">
                  <span className="text-xs text-[var(--bt-muted)]">Internal Notes</span>
                  <textarea
                    name="internalNotes"
                    rows={5}
                    defaultValue={row.internalNotes ?? ""}
                    disabled={!canEdit}
                    className="w-full rounded border bg-white px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)] disabled:opacity-60"
                    style={{ borderColor: "var(--bt-border)" }}
                  />
                </label>
              </section>
            </aside>
          </div>

          <footer
            className="flex shrink-0 flex-col gap-2 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5"
            style={{ borderColor: "var(--bt-border)" }}
          >
            <div className="flex min-h-[1.25rem] items-center gap-2 text-xs">
              <InfoIcon className="h-4 w-4 text-sky-500" />
              {state.error || workState.error ? (
                <p role="alert" className="text-red-600">
                  {state.error ?? workState.error}
                </p>
              ) : state.acceptUrl ? (
                <a href={state.acceptUrl} className="break-all underline" style={{ color: "var(--bt-primary)" }}>
                  Accept link
                </a>
              ) : null}
            </div>

            <div className="relative flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                aria-label="More actions"
                onClick={() => setMenuOpen((open) => !open)}
                className="rounded p-2 text-[var(--bt-muted)] hover:bg-black/5"
              >
                <MenuIcon className="h-4 w-4" />
              </button>
              {menuOpen ? (
                <div
                  className="absolute bottom-full right-0 mb-1 min-w-[10rem] rounded border bg-white py-1 text-sm shadow-lg"
                  style={{ borderColor: "var(--bt-border)" }}
                >
                  <Link href={detailHref} className="block px-3 py-1.5 hover:bg-black/5" onClick={onClose}>
                    Open full page
                  </Link>
                </div>
              ) : null}
              <button
                type="submit"
                disabled={pending || !canEdit}
                onClick={() => setIntent("save")}
                className="rounded border bg-white px-4 py-2 text-sm font-semibold text-[var(--bt-text)] disabled:opacity-50 hover:bg-black/5"
                style={{ borderColor: "var(--bt-border)" }}
              >
                {pending && intent === "save" ? "Saving…" : "Save"}
              </button>
              <button
                type="submit"
                disabled={pending || !canSend}
                onClick={() => setIntent("send")}
                className="inline-flex items-center gap-1.5 rounded px-4 py-2 text-sm font-semibold text-[var(--bt-on-primary)] disabled:opacity-50"
                style={{ background: "var(--bt-primary)" }}
              >
                <SendIcon />
                {pending && intent === "send" ? "Sending…" : "Send"}
              </button>
            </div>
          </footer>
        </form>
      </div>
    </div>
  );
}
