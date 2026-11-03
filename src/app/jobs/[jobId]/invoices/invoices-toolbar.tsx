"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { CreateModal } from "@/components/shell/CreateModal";
import { ChevronDownIcon, FilterIcon, HelpIcon, ShareIcon } from "@/components/shell/icons";

import { CreateInvoiceForm } from "./create-invoice-form";

/**
 * Buildertrend Invoices header chrome: multi-color help / share / filter icons,
 * outlined "+ Payment schedule", and split "+ Invoice" primary (main click opens
 * create modal; chevron offers New invoice + Payment schedule).
 *
 * Kept invoices-local so PO/Bills ListToolbar chrome stays owned by those pages.
 */
export function InvoicesToolbar({
  jobId,
  scheduleActive,
}: {
  jobId: string;
  scheduleActive: boolean;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onDoc(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <div className="flex items-center gap-1">
        <IconHit title="Help" color="#3b82f6">
          <HelpIcon className="h-4 w-4" />
        </IconHit>
        <IconHit title="Share" color="#16a34a">
          <ShareIcon className="h-4 w-4" />
        </IconHit>
        <IconHit title="Filter" color="#0ea5e9">
          <FilterIcon className="h-4 w-4" />
        </IconHit>
      </div>

      <Link
        href={`/jobs/${jobId}/invoices?tab=schedule`}
        className="inline-flex min-h-9 items-center gap-1 rounded border px-3 py-1.5 text-sm font-semibold hover:bg-black/5"
        style={{
          borderColor: scheduleActive ? "var(--bt-primary)" : "#3b82f6",
          color: "#2563eb",
        }}
      >
        <span aria-hidden className="text-base leading-none">
          +
        </span>
        Payment schedule
      </Link>

      <div className="relative flex" ref={menuRef}>
        <button
          type="button"
          onClick={() => setInvoiceOpen(true)}
          className="inline-flex min-h-9 items-center rounded-l px-3 py-1.5 text-sm font-semibold text-[var(--bt-on-primary)]"
          style={{ background: "var(--bt-primary)" }}
        >
          + Invoice
        </button>
        <button
          type="button"
          aria-label="More invoice actions"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
          className="inline-flex min-h-9 items-center rounded-r border-l px-2 text-[var(--bt-on-primary)]"
          style={{ background: "var(--bt-primary)", borderColor: "color-mix(in srgb, white 28%, transparent)" }}
        >
          <ChevronDownIcon className="h-4 w-4" />
        </button>
        {menuOpen ? (
          <div
            className="absolute right-0 top-full z-20 mt-1 min-w-[12rem] overflow-hidden rounded-md border bg-[var(--bt-panel-bg)] py-1 shadow-lg"
            style={{ borderColor: "var(--bt-border)" }}
            role="menu"
          >
            <button
              type="button"
              role="menuitem"
              className="block w-full px-3 py-2 text-left text-sm text-[var(--bt-text)] hover:bg-black/5"
              onClick={() => {
                setMenuOpen(false);
                setInvoiceOpen(true);
              }}
            >
              New invoice
            </button>
            <Link
              role="menuitem"
              href={`/jobs/${jobId}/invoices?tab=schedule`}
              className="block px-3 py-2 text-sm text-[var(--bt-text)] hover:bg-black/5"
              onClick={() => setMenuOpen(false)}
            >
              Payment schedule
            </Link>
          </div>
        ) : null}
      </div>

      <CreateModal
        triggerLabel="+ Invoice"
        title="New invoice"
        open={invoiceOpen}
        onOpenChange={setInvoiceOpen}
        hideTrigger
      >
        <CreateInvoiceForm jobId={jobId} />
      </CreateModal>
    </div>
  );
}

function IconHit({ title, color, children }: { title: string; color: string; children: React.ReactNode }) {
  return (
    <span
      className="inline-flex h-9 w-9 items-center justify-center rounded border bg-[var(--bt-panel-bg)]"
      style={{ borderColor: "var(--bt-border)", color }}
      title={title}
      aria-hidden
    >
      {children}
    </span>
  );
}
