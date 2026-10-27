"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { PoCostLineItems } from "@/components/financial/PoCostLineItems";
import type { CostCodeOption } from "@/components/financial/CostCodeLineItems";
import { CloseIcon } from "@/components/shell/icons";

import { createPurchaseOrderAction, type ActionState } from "./actions";

const INITIAL: ActionState = {};

export interface VendorOption {
  readonly id: string;
  readonly name: string;
  readonly email: string | null;
}

/**
 * Buildertrend Purchase Order create modal — General Information, Scope of Work,
 * Cost table, Internal Only sidebar, sticky Save + Send footer. WCI colors.
 */
export function CreatePoForm({
  jobId,
  jobName,
  costCodes,
  vendors,
  suggestedPoNumber,
  defaultScopeOfWork,
  onClose,
}: {
  jobId: string;
  jobName: string;
  costCodes: readonly CostCodeOption[];
  vendors: readonly VendorOption[];
  suggestedPoNumber: string;
  defaultScopeOfWork: string;
  onClose?: () => void;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(createPurchaseOrderAction, INITIAL);
  const [intent, setIntent] = useState<"save" | "send">("save");
  const [materialsOnly, setMaterialsOnly] = useState(false);
  const [vendorId, setVendorId] = useState("");

  useEffect(() => {
    if (!state.ok || !state.purchaseOrderId) return;
    onClose?.();
    // revalidatePath remounts this page and would wipe an in-modal accept link —
    // always land on the detail view, carrying the link in the query when staff
    // must share it by hand (email not configured / vendor has no email).
    const params = new URLSearchParams();
    if (state.acceptUrl && state.needsManualDelivery) {
      params.set("acceptUrl", state.acceptUrl);
    }
    if (state.emailed) params.set("emailed", "1");
    const qs = params.toString();
    router.push(`/jobs/${jobId}/purchase-orders/${state.purchaseOrderId}${qs ? `?${qs}` : ""}`);
    router.refresh();
  }, [state.ok, state.purchaseOrderId, state.needsManualDelivery, state.acceptUrl, state.emailed, jobId, onClose, router]);

  const selectedVendor = vendors.find((vendor) => vendor.id === vendorId) ?? null;

  return (
    <form action={formAction} className="flex max-h-[92vh] flex-col">
      <input type="hidden" name="jobId" value={jobId} />
      <input type="hidden" name="intent" value={intent} />
      <input type="hidden" name="vendorName" value={selectedVendor?.name ?? ""} />

      <header
        className="flex shrink-0 items-start justify-between gap-3 border-b px-4 py-3 sm:px-5"
        style={{ borderColor: "var(--bt-border)" }}
      >
        <div className="min-w-0">
          <div className="truncate text-xs text-[var(--bt-muted)]">{jobName}</div>
          <h2 className="text-base font-semibold text-[var(--bt-text)]">Purchase Order</h2>
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
                <span className="text-xs font-medium text-[var(--bt-muted)]">Purchase Order #</span>
                <input
                  name="poNumber"
                  defaultValue={suggestedPoNumber}
                  placeholder="(Auto Assign)"
                  className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]"
                  style={{ borderColor: "var(--bt-border)" }}
                />
                <span className="text-[10px] text-[var(--bt-muted)]">Auto-assigned — change only if you need a specific number.</span>
              </label>

              <label className="grid gap-1 text-sm">
                <span className="text-xs font-medium text-[var(--bt-muted)]">Title</span>
                <input
                  name="title"
                  placeholder="Framing, Roofing, Doors & Windows…"
                  className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]"
                  style={{ borderColor: "var(--bt-border)" }}
                />
              </label>
            </div>

            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
              <label className="grid gap-1 text-sm">
                <span className="text-xs font-medium text-[var(--bt-muted)]">Assigned to</span>
                <select
                  name="vendorId"
                  value={vendorId}
                  onChange={(event) => setVendorId(event.target.value)}
                  required
                  className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]"
                  style={{ borderColor: "var(--bt-border)" }}
                >
                  <option value="" disabled>
                    Unassigned
                  </option>
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
                  onChange={(event) => setMaterialsOnly(event.target.checked)}
                  className="rounded border"
                  style={{ borderColor: "var(--bt-border)" }}
                />
                Materials Only
              </label>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-sm">
                <span className="text-xs font-medium text-[var(--bt-muted)]">Scheduled Completion</span>
                <input
                  type="date"
                  name="scheduledCompletionOn"
                  className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]"
                  style={{ borderColor: "var(--bt-border)" }}
                />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="text-xs font-medium text-[var(--bt-muted)]">Completion Date</span>
                <input
                  type="date"
                  name="completedOn"
                  className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]"
                  style={{ borderColor: "var(--bt-border)" }}
                />
              </label>
            </div>
          </section>

          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold text-[var(--bt-text)]">Scope of Work</h3>
            <textarea
              name="scopeOfWork"
              rows={10}
              defaultValue={defaultScopeOfWork}
              className="w-full rounded border px-3 py-2 font-mono text-xs leading-relaxed outline-none focus:border-[var(--bt-primary)] sm:text-sm"
              style={{ borderColor: "var(--bt-border)" }}
            />
          </section>

          <PoCostLineItems costCodes={costCodes} />
        </div>

        <aside
          className="border-t bg-black/[0.02] p-4 lg:border-l lg:border-t-0"
          style={{ borderColor: "var(--bt-border)" }}
        >
          <h3 className="text-sm font-semibold text-[var(--bt-text)]">Internal Only</h3>
          <p className="mt-1 text-[10px] text-[var(--bt-muted)]">Staff only — never shown to the vendor.</p>
          <textarea
            name="internalNotes"
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

        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            type="submit"
            disabled={pending}
            onClick={() => setIntent("save")}
            className="rounded border px-4 py-2 text-sm font-semibold text-[var(--bt-text)] disabled:opacity-50 hover:bg-black/5"
            style={{ borderColor: "var(--bt-border)" }}
          >
            {pending && intent === "save" ? "Saving…" : "Save"}
          </button>
          <button
            type="submit"
            disabled={pending}
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
  );
}

function SendIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden>
      <path d="M3.1 2.3a1 1 0 0 1 1.08-.12l13 6.5a1 1 0 0 1 0 1.84l-13 6.5A1 1 0 0 1 2 16.5v-4.3a1 1 0 0 1 .7-.95l6.55-2.05a.25.25 0 0 0 0-.48L2.7 6.67A1 1 0 0 1 2 5.72V3.1a1 1 0 0 1 1.1-.8Z" />
    </svg>
  );
}
