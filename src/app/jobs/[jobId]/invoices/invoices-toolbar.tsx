"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { ChevronDownIcon, CloseIcon, HelpIcon, ShareIcon } from "@/components/shell/icons";
import { ListFilterButton } from "@/components/shell/ListFilterSidebar";

import { CreateInvoiceForm, type CreateInvoiceModalProps } from "./create-invoice-form";

export type InvoiceCreateBranding = Omit<CreateInvoiceModalProps, "open" | "onOpenChange" | "jobId" | "jobName">;

/**
 * Buildertrend Invoices header chrome: Help / Share / Filter (working), outlined
 * "+ Payment schedule", and split "+ Invoice" opening the full Create Invoice modal.
 */
export function InvoicesToolbar({
  jobId,
  jobName,
  scheduleActive,
  filterOpen,
  filterActiveCount,
  onFilterClick,
  branding,
}: {
  jobId: string;
  jobName: string;
  scheduleActive: boolean;
  filterOpen: boolean;
  filterActiveCount: number;
  onFilterClick: () => void;
  branding: InvoiceCreateBranding;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [shareNote, setShareNote] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onDoc(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);

  useEffect(() => {
    if (!shareNote) return;
    const timer = window.setTimeout(() => setShareNote(null), 2200);
    return () => window.clearTimeout(timer);
  }, [shareNote]);

  async function sharePage() {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: `${jobName} — Invoices`, url });
        setShareNote("Shared");
        return;
      }
    } catch {
      /* fall through to clipboard */
    }
    try {
      await navigator.clipboard.writeText(url);
      setShareNote("Link copied");
    } catch {
      setShareNote("Copy failed — copy the URL from the address bar");
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <div className="relative flex items-center gap-1">
        <button
          type="button"
          onClick={() => setHelpOpen((open) => !open)}
          aria-expanded={helpOpen}
          aria-label="Help"
          className="inline-flex h-9 w-9 items-center justify-center rounded border bg-[var(--bt-panel-bg)] hover:bg-black/5"
          style={{ borderColor: helpOpen ? "var(--bt-primary)" : "var(--bt-border)", color: "#3b82f6" }}
          title="Help"
        >
          <HelpIcon className="h-4 w-4" />
        </button>
        {helpOpen ? (
          <div
            className="absolute right-0 top-full z-30 mt-1 w-[min(20rem,calc(100vw-2rem))] rounded-md border bg-white p-3 text-sm shadow-lg"
            style={{ borderColor: "var(--bt-border)" }}
            role="dialog"
            aria-label="Invoices help"
          >
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-sm font-semibold text-[var(--bt-text)]">Invoices</h3>
              <button
                type="button"
                aria-label="Close help"
                className="rounded p-0.5 text-[var(--bt-muted)] hover:bg-black/5"
                onClick={() => setHelpOpen(false)}
              >
                <CloseIcon className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-[var(--bt-muted)]">
              Create drafts with <span className="font-medium text-[var(--bt-text)]">+ Invoice</span>, review Details and
              Client preview, then Save or Send. Use Filter to narrow by keyword, status, or date paid. Payment schedule
              bills the contract in milestones.
            </p>
          </div>
        ) : null}

        <button
          type="button"
          onClick={() => void sharePage()}
          aria-label="Share"
          className="inline-flex h-9 w-9 items-center justify-center rounded border bg-[var(--bt-panel-bg)] hover:bg-black/5"
          style={{ borderColor: "var(--bt-border)", color: "#16a34a" }}
          title="Share"
        >
          <ShareIcon className="h-4 w-4" />
        </button>
        {shareNote ? (
          <span
            className="absolute -bottom-7 right-10 whitespace-nowrap rounded bg-[#111827] px-2 py-1 text-[11px] text-white"
            role="status"
          >
            {shareNote}
          </span>
        ) : null}

        <ListFilterButton activeCount={filterActiveCount} open={filterOpen} onClick={onFilterClick} />
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

      <CreateInvoiceForm
        jobId={jobId}
        jobName={jobName}
        open={invoiceOpen}
        onOpenChange={setInvoiceOpen}
        {...branding}
      />
    </div>
  );
}
