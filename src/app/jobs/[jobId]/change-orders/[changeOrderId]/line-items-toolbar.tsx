"use client";

import { DocumentIcon, GearIcon, PlusIcon, TrashIcon } from "@/components/shell/icons";

function CopyIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden>
      <rect x="6.5" y="6.5" width="9" height="10" rx="1.2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M4.5 13.5V4.7A1.2 1.2 0 0 1 5.7 3.5h8.3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function PercentIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden>
      <circle cx="6.5" cy="6.5" r="1.75" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="13.5" cy="13.5" r="1.75" stroke="currentColor" strokeWidth="1.5" />
      <path d="M14.5 5.5 5.5 14.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

/** Buildertrend vertical icon rail on the change-order line-items table. */
export function ChangeOrderLineItemsToolbar({ editable }: { editable: boolean }) {
  const btn =
    "flex h-8 w-8 items-center justify-center rounded text-[var(--bt-muted)] hover:bg-black/5 disabled:opacity-40";
  return (
    <div
      className="flex shrink-0 flex-col gap-0.5 border-l px-1 py-1"
      style={{ borderColor: "var(--bt-border)", background: "var(--bt-panel-bg-muted)" }}
      aria-label="Line item tools"
    >
      <button type="button" className={btn} title="Column settings" disabled>
        <GearIcon className="h-4 w-4" />
      </button>
      <button type="button" className={btn} title="Add line" disabled={!editable}>
        <PlusIcon className="h-4 w-4" />
      </button>
      <button type="button" className={btn} title="Duplicate" disabled={!editable}>
        <CopyIcon className="h-4 w-4" />
      </button>
      <button type="button" className={btn} title="Attachments" disabled>
        <DocumentIcon className="h-4 w-4" />
      </button>
      <button type="button" className={btn} title="Delete" disabled={!editable}>
        <TrashIcon className="h-4 w-4" />
      </button>
      <button type="button" className={btn} title="Markup %" disabled={!editable}>
        <PercentIcon className="h-4 w-4" />
      </button>
    </div>
  );
}
