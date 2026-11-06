"use client";

import { useState } from "react";

import { ChatIcon, HistoryIcon, PencilIcon } from "@/components/shell/icons";

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

/**
 * Buildertrend CO header chrome: link / history / comments / edit icons,
 * ellipsis (Print / Recall), and Add to dropdown (visual parity; destinations
 * use existing invoice/PO routes when available).
 */
export function ChangeOrderHeaderActions({
  jobId,
  changeOrderId,
  editable,
  onEditClick,
}: {
  jobId: string;
  changeOrderId: string;
  editable: boolean;
  onEditClick?: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  return (
    <div className="flex flex-wrap items-center justify-end gap-1">
      <span className="rounded p-1.5 text-[#0ea5e9]" title="Copy link" aria-hidden>
        <LinkIcon className="h-4 w-4" />
      </span>
      <a
        href="#co-line-items"
        className="rounded p-1.5 text-[#d97706] hover:bg-amber-50"
        title="History"
        aria-label="History"
      >
        <HistoryIcon className="h-4 w-4" />
      </a>
      <a
        href={`/jobs/${jobId}/comments`}
        className="rounded p-1.5 text-[#0ea5e9] hover:bg-sky-50"
        title="Comments"
        aria-label="Comments"
      >
        <ChatIcon className="h-4 w-4" />
      </a>
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
      ) : (
        <span className="rounded p-1.5 text-[var(--bt-muted)] opacity-40" title="Edit" aria-hidden>
          <PencilIcon className="h-4 w-4" />
        </span>
      )}

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
            <button
              type="button"
              className="block w-full px-3 py-1.5 text-left text-[var(--bt-muted)] hover:bg-black/5"
              title="Recall returns a sent change order to draft in Buildertrend. Use Decline/Approve controls when editable."
              onClick={() => setMenuOpen(false)}
            >
              Recall
            </button>
          </div>
        ) : null}
      </div>

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
            className="absolute right-0 z-20 mt-1 min-w-[11rem] rounded border bg-white py-1 text-sm shadow-lg"
            style={{ borderColor: "var(--bt-border)" }}
          >
            <a
              href={`/jobs/${jobId}/invoices`}
              className="block px-3 py-1.5 hover:bg-sky-50"
              onClick={() => setAddOpen(false)}
            >
              Invoice
            </a>
            <a
              href={`/jobs/${jobId}/purchase-orders`}
              className="block px-3 py-1.5 hover:bg-sky-50"
              onClick={() => setAddOpen(false)}
            >
              Purchase order
            </a>
            <a
              href={`/jobs/${jobId}/bills`}
              className="block px-3 py-1.5 hover:bg-sky-50"
              onClick={() => setAddOpen(false)}
            >
              Bill
            </a>
            <span className="sr-only">{changeOrderId}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
