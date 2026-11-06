"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { PencilIcon } from "@/components/shell/icons";

import { pushChangeOrderToPoAction, recallChangeOrderAction, type ActionState } from "../actions";

function EllipsisIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className={className} aria-hidden>
      <circle cx="4" cy="10" r="1.5" />
      <circle cx="10" cy="10" r="1.5" />
      <circle cx="16" cy="10" r="1.5" />
    </svg>
  );
}

function LinkIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden>
      <path
        d="M8.5 11.5 11.5 8.5M7.2 9.3l-1.4 1.4a2.8 2.8 0 0 0 4 4l1.4-1.4M12.8 10.7l1.4-1.4a2.8 2.8 0 0 0-4-4L8.8 6.7"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden>
      <path d="M5.5 8l4.5 4.5L14.5 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const PO_INITIAL: ActionState = {};

/**
 * Working CO header actions only (Damien: zero decorative/inert UI).
 * Copy link · Edit · Print · Recall (pending) · Add to Purchase order (approved).
 */
export function ChangeOrderHeaderActions({
  jobId,
  changeOrderId,
  status,
  editable,
  onEditClick,
}: {
  jobId: string;
  changeOrderId: string;
  status: string;
  editable: boolean;
  onEditClick?: () => void;
}) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [poOpen, setPoOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [poState, poAction, poPending] = useActionState(pushChangeOrderToPoAction, PO_INITIAL);

  useEffect(() => {
    if (poState.ok && poState.purchaseOrderId) {
      router.push(`/jobs/${jobId}/purchase-orders/${poState.purchaseOrderId}`);
    }
  }, [poState.ok, poState.purchaseOrderId, jobId, router]);

  async function copyLink() {
    const url = `${window.location.origin}/jobs/${jobId}/change-orders/${changeOrderId}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      window.prompt("Copy link", url);
    }
  }

  const canRecall = status === "PENDING_APPROVAL";
  const canPushPo = status === "APPROVED";

  return (
    <div className="flex flex-wrap items-center justify-end gap-1">
      <button
        type="button"
        onClick={() => void copyLink()}
        className="rounded p-1.5 text-[#0ea5e9] hover:bg-sky-50"
        title={copied ? "Copied" : "Copy link"}
        aria-label={copied ? "Link copied" : "Copy link"}
      >
        <LinkIcon className="h-4 w-4" />
      </button>

      {editable ? (
        <button
          type="button"
          onClick={onEditClick}
          className="rounded p-1.5 text-[var(--bt-muted)] hover:bg-black/5"
          title="Edit"
          aria-label="Edit"
        >
          <PencilIcon className="h-4 w-4" />
        </button>
      ) : null}

      <div className="relative ml-1">
        <button
          type="button"
          aria-label="More actions"
          onClick={() => {
            setMenuOpen((open) => !open);
            setAddOpen(false);
          }}
          className="rounded p-1.5 text-[var(--bt-muted)] hover:bg-black/5"
        >
          <EllipsisIcon className="h-4 w-4" />
        </button>
        {menuOpen ? (
          <div
            className="absolute right-0 z-20 mt-1 min-w-[8rem] rounded border bg-white py-1 text-sm shadow-lg"
            style={{ borderColor: "var(--bt-border)" }}
          >
            <button
              type="button"
              className="block w-full px-3 py-1.5 text-left hover:bg-sky-50"
              onClick={() => {
                window.print();
                setMenuOpen(false);
              }}
            >
              Print
            </button>
            {canRecall ? (
              <form action={recallChangeOrderAction}>
                <input type="hidden" name="jobId" value={jobId} />
                <input type="hidden" name="changeOrderId" value={changeOrderId} />
                <button type="submit" className="block w-full px-3 py-1.5 text-left hover:bg-sky-50" onClick={() => setMenuOpen(false)}>
                  Recall
                </button>
              </form>
            ) : null}
          </div>
        ) : null}
      </div>

      {canPushPo ? (
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setAddOpen((open) => !open);
              setMenuOpen(false);
            }}
            className="inline-flex items-center gap-1 rounded border bg-white px-3 py-1.5 text-sm font-semibold text-[var(--bt-text)] hover:bg-black/5"
            style={{ borderColor: "var(--bt-border)" }}
          >
            Add to
            <ChevronDownIcon className="h-3.5 w-3.5" />
          </button>
          {addOpen ? (
            <div
              className="absolute right-0 z-20 mt-1 min-w-[12rem] rounded border bg-white py-1 text-sm shadow-lg"
              style={{ borderColor: "var(--bt-border)" }}
            >
              <button
                type="button"
                className="block w-full px-3 py-1.5 text-left hover:bg-sky-50"
                onClick={() => {
                  setPoOpen(true);
                  setAddOpen(false);
                }}
              >
                Purchase order
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {poOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setPoOpen(false)} />
          <form
            action={poAction}
            className="relative w-full max-w-md rounded-t-lg bg-[var(--bt-panel-bg)] p-4 shadow-xl sm:rounded-lg"
            role="dialog"
            aria-modal="true"
            aria-label="Add to purchase order"
          >
            <input type="hidden" name="jobId" value={jobId} />
            <input type="hidden" name="changeOrderId" value={changeOrderId} />
            <h3 className="text-sm font-semibold text-[var(--bt-text)]">Add to purchase order</h3>
            <p className="mt-1 text-xs text-[var(--bt-muted)]">Creates a PO from this approved change order.</p>
            <label className="mt-3 grid gap-1 text-sm">
              <span className="text-xs font-medium text-[var(--bt-muted)]">PO number</span>
              <input
                name="poNumber"
                required
                className="rounded border px-3 py-2 text-sm"
                style={{ borderColor: "var(--bt-border)" }}
              />
            </label>
            <label className="mt-3 grid gap-1 text-sm">
              <span className="text-xs font-medium text-[var(--bt-muted)]">Vendor name</span>
              <input
                name="vendorName"
                required
                className="rounded border px-3 py-2 text-sm"
                style={{ borderColor: "var(--bt-border)" }}
              />
            </label>
            {poState.error ? <p className="mt-2 text-xs text-red-600">{poState.error}</p> : null}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPoOpen(false)}
                className="rounded border px-3 py-1.5 text-sm font-semibold"
                style={{ borderColor: "var(--bt-border)" }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={poPending}
                className="rounded px-3 py-1.5 text-sm font-semibold text-[var(--bt-on-primary)] disabled:opacity-50"
                style={{ background: "var(--bt-primary)" }}
              >
                {poPending ? "Creating…" : "Create PO"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
