"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { UserButton } from "@clerk/nextjs";

import {
  FILES_NAV,
  FINANCIAL_NAV,
  JOBS_NAV,
  MESSAGING_HREF,
  PROJECT_MANAGEMENT_NAV,
  REPORTS_HREF,
  SALES_NAV,
  type JobNavLink,
} from "@/lib/buildertrend-nav";

import {
  BellIcon,
  ChatIcon,
  ChevronDownIcon,
  HelpIcon,
  PeopleIcon,
  SearchIcon,
} from "./icons";

/** One of Buildertrend's job-scoped mega-dropdowns (Project Management, Files, Financial). */
function JobNavDropdown({ label, items, activeJobId }: { label: string; items: readonly JobNavLink[]; activeJobId?: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className="flex items-center gap-1 rounded px-3 py-2 transition hover:bg-white/10"
        aria-expanded={open}
      >
        {label}
        <ChevronDownIcon className="h-3.5 w-3.5" />
      </button>
      {open ? (
        <div className="absolute left-0 top-full z-30 mt-1 w-56 rounded-md border border-black/10 bg-white py-1 text-sm text-[var(--bt-text)] shadow-lg">
          {activeJobId ? (
            items.map((item) => (
              <Link
                key={item.path}
                href={`/jobs/${activeJobId}${item.path}`}
                className="flex items-center justify-between px-3 py-2 hover:bg-black/5"
              >
                {item.label}
                {item.isNew ? (
                  <span className="rounded bg-[var(--bt-primary)] px-1.5 py-0.5 text-[10px] font-semibold text-white">
                    New
                  </span>
                ) : null}
              </Link>
            ))
          ) : (
            <div className="px-3 py-2 text-xs text-[var(--bt-muted)]">Select a job first.</div>
          )}
        </div>
      ) : null}
    </div>
  );
}

/** A dropdown of plain (non job-scoped) links, e.g. the "Sales" menu. */
function FlatNavDropdown({ label, items }: { label: string; items: readonly { label: string; href: string }[] }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className="flex items-center gap-1 rounded px-3 py-2 transition hover:bg-white/10"
        aria-expanded={open}
      >
        {label}
        <ChevronDownIcon className="h-3.5 w-3.5" />
      </button>
      {open ? (
        <div className="absolute left-0 top-full z-30 mt-1 w-56 rounded-md border border-black/10 bg-white py-1 text-sm text-[var(--bt-text)] shadow-lg">
          {items.map((item) => (
            <Link key={item.href} href={item.href} className="block px-3 py-2 hover:bg-black/5">
              {item.label}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Buildertrend's dark-teal top bar: brand mark, primary nav, the job-scoped
 * mega-dropdowns (Project Management, Files, Financial — meaningful only once
 * a job is selected), a flat Messaging link, and the icon cluster on the
 * right. Buildertrend has no secondary tab strip below this bar — every
 * job-scoped section, including Files and Financial, lives in a top-level
 * dropdown here (confirmed against Damien's screenshots, 2026-08-28). Client
 * component only for the dropdowns' open state and the active-link highlight.
 */
export function TopNav({
  activeJobId,
  clerkConfigured,
}: {
  activeJobId?: string;
  /** Computed server-side (CLERK_SECRET_KEY isn't inlined into the client bundle, so this
   *  component can't call isClerkConfigured() itself and get the right answer in the browser). */
  clerkConfigured: boolean;
}) {
  const pathname = usePathname();
  const messagingHref = activeJobId ? `/jobs/${activeJobId}${MESSAGING_HREF}` : undefined;

  return (
    <header
      className="flex h-14 items-center justify-between gap-4 px-4 text-white"
      style={{ background: "var(--bt-nav)" }}
    >
      <div className="flex items-center gap-6">
        <Link href="/jobs" className="text-lg font-bold tracking-tight">
          WCI OS
        </Link>

        <nav className="flex items-center gap-1 text-sm font-medium">
          <FlatNavDropdown label="Sales" items={SALES_NAV} />
          <FlatNavDropdown label="Jobs" items={JOBS_NAV} />

          <JobNavDropdown label="Project Management" items={PROJECT_MANAGEMENT_NAV} activeJobId={activeJobId} />
          <JobNavDropdown label="Files" items={FILES_NAV} activeJobId={activeJobId} />

          {messagingHref ? (
            <Link
              href={messagingHref}
              className="rounded px-3 py-2 transition hover:bg-white/10"
              style={pathname?.startsWith(messagingHref) ? { background: "var(--bt-nav-hover)" } : undefined}
            >
              Messaging
            </Link>
          ) : (
            <span className="cursor-default rounded px-3 py-2 text-white/40">Messaging</span>
          )}

          <JobNavDropdown label="Financial" items={FINANCIAL_NAV} activeJobId={activeJobId} />

          <Link
            href={REPORTS_HREF}
            className="rounded px-3 py-2 transition hover:bg-white/10"
            style={pathname?.startsWith(REPORTS_HREF) ? { background: "var(--bt-nav-hover)" } : undefined}
          >
            Reports
          </Link>
        </nav>
      </div>

      <div className="flex items-center gap-2">
        <button type="button" className="rounded p-2 transition hover:bg-white/10" aria-label="Search">
          <SearchIcon className="h-4.5 w-4.5" />
        </button>
        <button type="button" className="rounded p-2 transition hover:bg-white/10" aria-label="Notifications">
          <BellIcon className="h-4.5 w-4.5" />
        </button>
        <button type="button" className="rounded p-2 transition hover:bg-white/10" aria-label="Messages">
          <ChatIcon className="h-4.5 w-4.5" />
        </button>
        <button type="button" className="rounded p-2 transition hover:bg-white/10" aria-label="People">
          <PeopleIcon className="h-4.5 w-4.5" />
        </button>
        <button type="button" className="rounded p-2 transition hover:bg-white/10" aria-label="Help">
          <HelpIcon className="h-4.5 w-4.5" />
        </button>
        {clerkConfigured ? (
          <div className="ml-2">
            <UserButton />
          </div>
        ) : null}
      </div>
    </header>
  );
}
