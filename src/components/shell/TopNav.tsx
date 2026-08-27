"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { UserButton } from "@clerk/nextjs";

import { JOB_TOP_NAV, PROJECT_MANAGEMENT_NAV, REPORTS_HREF, TOP_LEVEL_NAV } from "@/lib/buildertrend-nav";

import {
  BellIcon,
  ChatIcon,
  ChevronDownIcon,
  HelpIcon,
  PeopleIcon,
  SearchIcon,
} from "./icons";

/**
 * Buildertrend's dark-teal top bar: brand mark, primary nav, the "Project
 * Management" mega-dropdown (only meaningful once a job is selected), and the
 * icon cluster on the right. Below it, a second light tab strip for the
 * job-scoped tabs (Overview/Files/Messaging/Financial) shows only once a job
 * is selected — matching Buildertrend's own two-tier top nav. Client
 * component only for the dropdown's open state and the active-tab highlight.
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
  const [pmOpen, setPmOpen] = useState(false);
  const pathname = usePathname();

  return (
    <>
      <header
        className="flex h-14 items-center justify-between gap-4 px-4 text-white"
        style={{ background: "var(--bt-nav)" }}
      >
        <div className="flex items-center gap-6">
          <Link href="/jobs" className="text-lg font-bold tracking-tight">
            WCI OS
          </Link>

          <nav className="flex items-center gap-1 text-sm font-medium">
            {TOP_LEVEL_NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded px-3 py-2 transition hover:bg-white/10"
                style={pathname?.startsWith(item.href) ? { background: "var(--bt-nav-hover)" } : undefined}
              >
                {item.label}
              </Link>
            ))}

            <div className="relative">
              <button
                type="button"
                onClick={() => setPmOpen((open) => !open)}
                onBlur={() => setTimeout(() => setPmOpen(false), 150)}
                className="flex items-center gap-1 rounded px-3 py-2 transition hover:bg-white/10"
                aria-expanded={pmOpen}
              >
                Project Management
                <ChevronDownIcon className="h-3.5 w-3.5" />
              </button>
              {pmOpen ? (
                <div className="absolute left-0 top-full z-30 mt-1 w-56 rounded-md border border-black/10 bg-white py-1 text-sm text-[var(--bt-text)] shadow-lg">
                  {activeJobId ? (
                    PROJECT_MANAGEMENT_NAV.map((item) => (
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

      {activeJobId ? (
        <nav
          className="flex items-center gap-1 border-b bg-white px-4 text-sm font-medium"
          style={{ borderColor: "var(--bt-border)" }}
        >
          <Link
            href={`/jobs/${activeJobId}`}
            className="border-b-2 px-3 py-2.5"
            style={
              pathname === `/jobs/${activeJobId}`
                ? { borderColor: "var(--bt-active-bar)", color: "var(--bt-text)" }
                : { borderColor: "transparent", color: "var(--bt-muted)" }
            }
          >
            Overview
          </Link>
          {JOB_TOP_NAV.map((item) => {
            const href = `/jobs/${activeJobId}${item.path}`;
            const isActive = pathname?.startsWith(href);
            return (
              <Link
                key={item.path}
                href={href}
                className="border-b-2 px-3 py-2.5"
                style={
                  isActive
                    ? { borderColor: "var(--bt-active-bar)", color: "var(--bt-text)" }
                    : { borderColor: "transparent", color: "var(--bt-muted)" }
                }
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      ) : null}
    </>
  );
}
