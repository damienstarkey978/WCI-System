"use client";

import Link from "next/link";
import { useActionState, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import { ScopeRichText } from "@/components/financial/ScopeRichText";
import {
  CloseIcon,
  HistoryIcon,
  InfoIcon,
  MaximizeIcon,
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

function SectionHeader({
  title,
  info,
  trailing,
}: {
  title: string;
  info?: boolean;
  trailing?: ReactNode;
}) {
  return (
    <div
      className="flex items-center justify-between gap-2 border-b bg-[#eef0f2] px-3 py-2"
      style={{ borderColor: "var(--bt-border)" }}
    >
      <h3 className="inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--bt-text)]">
        {title}
        {info ? <InfoIcon className="h-3.5 w-3.5 text-sky-500" /> : null}
      </h3>
      {trailing}
    </div>
  );
}

/**
 * Buildertrend pencil-modal for an existing Purchase Order — General Information /
 * Scope of Work on the left, Work Status + PO Status + Internal Notes on the right,
 * Save + Send in the footer. Pop-out opens the full detail page.
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

  const fieldClass =
    "rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-link,#1F4ECD)] disabled:opacity-60";
  const labelClass = "text-xs font-semibold text-[var(--bt-text)]";

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
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[var(--bt-chrome-export,#16a34a)] hover:bg-black/5"
              >
                <MaximizeIcon className="h-4 w-4" />
              </Link>
              <Link
                href={`${detailHref}#history`}
                aria-label="History"
                title="History"
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[#d97706] hover:bg-amber-50"
              >
                <HistoryIcon className="h-4 w-4" />
              </Link>
              {/* Comments / chat deferred until a working PO comments thread ships — no inert icon. */}
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[var(--bt-muted)] hover:bg-black/5"
              >
                <CloseIcon className="h-4 w-4" />
              </button>
            </div>
          </header>

          <div className="grid min-h-0 flex-1 overflow-y-auto lg:grid-cols-[minmax(0,1fr)_17rem]">
            <div className="flex flex-col gap-4 p-4 sm:p-5">
              <section
                className="overflow-hidden rounded border bg-white"
                style={{ borderColor: "var(--bt-border)" }}
              >
                <SectionHeader
                  title="General Information"
                  trailing={
                    <span
                      className="rounded px-2 py-0.5 text-[10px] font-semibold"
                      style={{ background: statusStyle.bg, color: statusStyle.text }}
                    >
                      {formatPoStatusLabel(row.status)}
                    </span>
                  }
                />

                <div className="flex flex-col gap-4 p-3 sm:p-4">
                  <div className="flex flex-wrap items-end justify-between gap-3">
                    <label className="grid min-w-[9rem] flex-1 gap-1 text-sm sm:max-w-[14rem]">
                      <span className={`inline-flex items-center gap-1 ${labelClass}`}>
                        Purchase Order # <InfoIcon className="h-3 w-3 text-sky-500" />
                      </span>
                      <input
                        name="poNumber"
                        defaultValue={displayPo}
                        disabled={!canEdit}
                        className={fieldClass}
                        style={{ borderColor: "var(--bt-border)" }}
                      />
                    </label>
                    <div className="pb-0.5 text-right">
                      <div className={labelClass}>Total Cost</div>
                      <div className="text-base font-semibold text-[var(--bt-text)]">
                        {formatMoney(row.totalCents)}
                      </div>
                    </div>
                  </div>

                  <label className="grid gap-1 text-sm">
                    <span className={labelClass}>Title</span>
                    <input
                      name="title"
                      defaultValue={row.title ?? ""}
                      disabled={!canEdit}
                      className={fieldClass}
                      style={{ borderColor: "var(--bt-border)" }}
                    />
                  </label>

                  <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                    <label className="grid gap-1 text-sm">
                      <span className={labelClass}>Assigned to</span>
                      <select
                        name="vendorId"
                        value={vendorId}
                        onChange={(event) => setVendorId(event.target.value)}
                        disabled={!canEdit}
                        className={fieldClass}
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
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className={labelClass}>Scheduled Completion</span>
                      <button
                        type="button"
                        disabled={!canEdit}
                        onClick={() => setCompletionMode("date")}
                        className="text-sm font-medium disabled:opacity-50"
                        style={{
                          color:
                            completionMode === "date"
                              ? "var(--bt-link,#1F4ECD)"
                              : "var(--bt-muted)",
                          textDecoration: completionMode === "date" ? "underline" : "none",
                        }}
                      >
                        Choose date
                      </button>
                      <button
                        type="button"
                        disabled={!canEdit}
                        onClick={() => setCompletionMode("schedule")}
                        className="text-sm font-medium disabled:opacity-50"
                        style={{
                          color:
                            completionMode === "schedule"
                              ? "var(--bt-link,#1F4ECD)"
                              : "var(--bt-muted)",
                          textDecoration: completionMode === "schedule" ? "underline" : "none",
                        }}
                      >
                        Link to Schedule
                      </button>
                    </div>

                    {completionMode === "date" ? (
                      <label className="grid max-w-xs gap-1 text-sm">
                        <span className={labelClass}>Completion Date</span>
                        <input
                          type="date"
                          name="scheduledCompletionOn"
                          defaultValue={toDateInputValue(row.scheduledCompletionOn)}
                          disabled={!canEdit}
                          className={fieldClass}
                          style={{ borderColor: "var(--bt-border)" }}
                        />
                        <input
                          type="hidden"
                          name="completedOn"
                          defaultValue={toDateInputValue(row.completedOn)}
                        />
                      </label>
                    ) : (
                      <label className="grid max-w-md gap-1 text-sm">
                        <span className={labelClass}>Schedule item</span>
                        <select
                          name="linkedScheduleItemId"
                          value={linkedScheduleItemId}
                          onChange={(event) => setLinkedScheduleItemId(event.target.value)}
                          disabled={!canEdit}
                          className={fieldClass}
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
                </div>
              </section>

              <section
                className="overflow-hidden rounded border bg-white"
                style={{ borderColor: "var(--bt-border)" }}
              >
                <SectionHeader title="Scope of Work" info />
                <div className="p-3 sm:p-4">
                  {canEdit ? (
                    <ScopeRichText defaultValue={row.scopeOfWork ?? ""} hideLabel />
                  ) : (
                    <div
                      className="min-h-[10rem] whitespace-pre-wrap rounded border px-3 py-2 text-sm text-[var(--bt-text)]"
                      style={{ borderColor: "var(--bt-border)" }}
                    >
                      {row.scopeOfWork?.trim() ? (
                        row.scopeOfWork
                      ) : (
                        <span className="text-[var(--bt-muted)]">—</span>
                      )}
                    </div>
                  )}
                  <div className="mt-2">
                    <InfoIcon className="h-4 w-4 text-sky-500" />
                  </div>
                </div>
              </section>
            </div>

            <aside
              className="flex flex-col gap-3 border-t bg-[#f3f4f6] p-3 sm:p-4 lg:border-l lg:border-t-0"
              style={{ borderColor: "var(--bt-border)" }}
            >
              <section
                className="overflow-hidden rounded border bg-white"
                style={{ borderColor: "var(--bt-border)" }}
              >
                <SectionHeader title="Work Status" />
                <div className="p-3">
                  <span
                    className="inline-block rounded px-2 py-0.5 text-[10px] font-semibold"
                    style={{
                      background: workComplete ? workStyle.bg : "#f5e6c8",
                      color: workComplete ? workStyle.text : "#92400e",
                    }}
                  >
                    {workComplete ? formatWorkStatusLabel("WORK_COMPLETE") : "Work Incomplete"}
                  </span>
                  {/* formAction routes this submit to setWorkStatusAction without a nested <form>. */}
                  <button
                    type="submit"
                    formAction={workAction}
                    name="workComplete"
                    value={workComplete ? "false" : "true"}
                    disabled={workPending}
                    className="mt-3 w-full rounded border bg-white px-3 py-1.5 text-xs font-semibold text-[var(--bt-text)] hover:bg-black/5 disabled:opacity-50"
                    style={{ borderColor: "var(--bt-border)" }}
                  >
                    {workPending ? "Working…" : workComplete ? "Reopen Work" : "Mark Work Complete"}
                  </button>
                </div>
              </section>

              <section
                className="overflow-hidden rounded border bg-white"
                style={{ borderColor: "var(--bt-border)" }}
              >
                <SectionHeader title="Purchase Order Status" />
                <div className="p-3">
                  <div className="h-2.5 w-full overflow-hidden rounded-sm bg-[#d1d5db]">
                    <div
                      className="h-full"
                      style={{
                        width: `${Math.min(100, Math.max(0, row.billedPercent))}%`,
                        background: row.billedPercent > 0 ? "var(--bt-badge-qb-bg)" : "transparent",
                      }}
                    />
                  </div>
                  <div className="mt-2 flex items-center gap-2 text-xs">
                    <span className="rounded border border-[#e5e7eb] bg-[#f9fafb] px-2 py-1 font-semibold text-[var(--bt-text)]">
                      {row.billedPercent}%
                    </span>
                    <span className="text-[var(--bt-muted)]">
                      <span className="font-semibold text-[var(--bt-text)]">Outstanding:</span>{" "}
                      {formatMoney(row.outstandingCents)}
                    </span>
                  </div>
                  <p className="mt-2 text-[10px] text-[var(--bt-muted)]">
                    {row.billedPercent === 0
                      ? "No Payments have been made or requested."
                      : `${row.billedPercent}% billed against this purchase order.`}
                  </p>
                </div>
              </section>

              <section
                className="overflow-hidden rounded border bg-white"
                style={{ borderColor: "var(--bt-border)" }}
              >
                <SectionHeader title="Internal Only" />
                <div className="p-3">
                  <label className="grid gap-1 text-sm">
                    <span className="text-xs text-[var(--bt-muted)]">Internal Notes</span>
                    <textarea
                      name="internalNotes"
                      rows={5}
                      defaultValue={row.internalNotes ?? ""}
                      disabled={!canEdit}
                      className="w-full rounded border bg-white px-3 py-2 text-sm outline-none focus:border-[var(--bt-link,#1F4ECD)] disabled:opacity-60"
                      style={{ borderColor: "var(--bt-border)" }}
                    />
                  </label>
                </div>
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
                <a
                  href={state.acceptUrl}
                  className="break-all underline"
                  style={{ color: "var(--bt-primary)" }}
                >
                  Accept link
                </a>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2">
              {/*
                Footer ⋯ (Amend / Recall / …) stays on the full detail page WorkflowButtons
                until those actions are wired into the pencil modal — no duplicate pop-out menu.
              */}
              <button
                type="submit"
                disabled={pending || !canEdit}
                onClick={() => setIntent("save")}
                className="rounded border bg-white px-4 py-2 text-sm font-semibold text-[var(--bt-text)] hover:bg-black/5 disabled:opacity-50"
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
