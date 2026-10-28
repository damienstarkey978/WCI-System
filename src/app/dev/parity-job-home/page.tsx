"use client";

/**
 * Visual fixture for WCI-88 job home / sidebar / chrome BT parity.
 * Client-only mock data — no DB. Open at /dev/parity-job-home for after-shots.
 */
import Link from "next/link";

import { DocumentIcon, ThumbsUpIcon } from "@/components/shell/icons";
import { GlobalSearch } from "@/components/shell/GlobalSearch";
import { JobSidebar, type SidebarJob } from "@/components/shell/JobSidebar";
import { BrandMark } from "@/components/shell/BrandMark";
import {
  BellIcon,
  ChatIcon,
  HelpIcon,
  PeopleIcon,
  PlusIcon,
} from "@/components/shell/icons";

const MOCK_JOBS: SidebarJob[] = [
  {
    id: "job_parramore",
    name: "7935 Parramore Rd.-Slate Medical-Concrete",
    prefix: null,
    status: "OPEN",
    groupName: "General",
    clientName: "Lee Babbitt / Slate",
    address: "7935 Parramore Rd, Jacksonville, FL",
    qboLinked: true,
  },
  {
    id: "job_pine",
    name: "11296 Pine St - Lamb",
    prefix: null,
    status: "OPEN",
    groupName: "General",
    clientName: null,
    address: null,
    qboLinked: true,
  },
  {
    id: "job_candle",
    name: "932 Candlebark Dr - Alleyne",
    prefix: null,
    status: "OPEN",
    groupName: "General",
    clientName: null,
    address: null,
    qboLinked: true,
  },
  {
    id: "job_bancroft",
    name: "4802 Bancroft Remodel",
    prefix: null,
    status: "OPEN",
    groupName: "General",
    clientName: null,
    address: null,
    qboLinked: true,
  },
  {
    id: "job_warranty",
    name: "Old Warranty Job",
    prefix: null,
    status: "WARRANTY",
    groupName: "General",
    clientName: null,
    address: null,
    qboLinked: false,
  },
];

function UpToDateEmpty({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center gap-2 px-2 py-4 text-center">
      <ThumbsUpIcon className="h-10 w-10 text-[var(--bt-muted)] opacity-70" />
      <p className="text-sm text-[var(--bt-muted)]">{message}</p>
    </div>
  );
}

function Avatar({ label }: { label: string }) {
  return (
    <div
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
      style={{ background: "var(--bt-status-open-bg)", color: "var(--bt-status-open-text)" }}
    >
      {label.slice(0, 2).toUpperCase()}
    </div>
  );
}

export default function ParityJobHomeFixturePage() {
  const today = new Date();
  const dayNum = today.getDate();
  const weekday = today.toLocaleDateString("en-US", { weekday: "long" });
  const monthShort = today.toLocaleDateString("en-US", { month: "short" });

  return (
    <div className="flex h-screen flex-col bg-[var(--bt-page-bg)]" data-testid="parity-job-home-fixture">
      {/* Minimal top chrome matching TopNav layout (no Clerk) */}
      <header className="flex h-14 items-center gap-2 px-3 text-white sm:gap-3 sm:px-4" style={{ background: "var(--bt-nav)" }}>
        <BrandMark className="h-8 w-auto" />
        <nav className="hidden items-center gap-1 text-sm font-medium xl:flex">
          {["Sales", "Jobs", "Project Management", "Files", "Messaging", "Financial", "Reports"].map((label) => (
            <span key={label} className="rounded px-3 py-2">
              {label}
            </span>
          ))}
        </nav>
        <div className="hidden min-w-0 flex-1 justify-center px-2 md:flex">
          <GlobalSearch variant="pill" className="w-full max-w-sm lg:max-w-md" />
        </div>
        <div className="ml-auto flex items-center gap-0.5">
          <span className="rounded p-2">
            <PlusIcon className="h-5 w-5" />
          </span>
          <span className="rounded p-2">
            <BellIcon className="h-4.5 w-4.5" />
          </span>
          <span className="rounded p-2">
            <ChatIcon className="h-4.5 w-4.5" />
          </span>
          <span className="rounded p-2">
            <PeopleIcon className="h-4.5 w-4.5" />
          </span>
          <span className="rounded p-2">
            <HelpIcon className="h-4.5 w-4.5" />
          </span>
          <span className="ml-2 flex h-8 w-8 items-center justify-center rounded-full bg-white/20 text-xs font-semibold">DS</span>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <JobSidebar jobs={MOCK_JOBS} activeJobId="job_parramore" organizationName="World Construction Inc." />
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto flex max-w-6xl flex-col gap-3 p-3 sm:gap-4 sm:p-6">
            <div className="rounded-lg border bg-[var(--bt-panel-bg)] p-4 sm:p-5" style={{ borderColor: "var(--bt-border)" }}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <h1 className="text-lg font-semibold text-[var(--bt-text)] sm:text-xl">7935 Parramore Rd.-Slate Medical-Concrete</h1>
                  <span
                    className="rounded-full px-2 py-0.5 text-xs font-semibold"
                    style={{ background: "var(--bt-status-open-bg)", color: "var(--bt-status-open-text)" }}
                  >
                    Open
                  </span>
                </div>
                <span className="text-lg text-[var(--bt-muted)]">⋯</span>
              </div>
              <a className="mt-1 inline-block text-sm text-[var(--bt-primary)]" href="#">
                7935 Parramore Rd, Jacksonville, FL 32244
              </a>
              <p className="mt-3 text-sm text-[var(--bt-text)]">0 internal users are clocked in as of 2:09 PM.</p>
              <Link href="#" className="text-sm text-[var(--bt-primary)]">
                View time sheets
              </Link>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--bt-muted)]">Clients</h2>
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <Avatar label="LS" />
                    <span className="flex h-9 w-9 items-center justify-center rounded-full border text-lg text-[var(--bt-muted)]" style={{ borderColor: "var(--bt-border)" }}>
                      +
                    </span>
                  </div>
                </div>
                <div>
                  <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--bt-muted)]">Project Managers</h2>
                  <div className="mt-1.5">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full border text-lg text-[var(--bt-muted)]" style={{ borderColor: "var(--bt-border)" }}>
                      +
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <section className="rounded-lg border bg-[var(--bt-panel-bg)]" style={{ borderColor: "var(--bt-border)" }}>
              <div className="grid divide-y sm:grid-cols-3 sm:divide-x sm:divide-y-0" style={{ borderColor: "var(--bt-border)" }}>
                <div className="p-4">
                  <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--bt-muted)]">Past Due</h2>
                  <UpToDateEmpty message="Everything is up-to-date." />
                </div>
                <div className="p-4">
                  <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--bt-muted)]">Due Today For You</h2>
                  <div className="mt-2">
                    <span className="inline-flex items-center gap-2 text-sm font-medium text-[var(--bt-primary)]">
                      Invoices
                      <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-400 px-1.5 text-[11px] font-bold text-amber-950">1</span>
                    </span>
                  </div>
                </div>
                <div className="p-4">
                  <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--bt-muted)]">Action Items</h2>
                  <UpToDateEmpty message="Nothing requires your attention at the moment." />
                </div>
              </div>
            </section>

            <div className="grid gap-3 sm:gap-4 lg:grid-cols-3">
              <section className="rounded-lg border bg-[var(--bt-panel-bg)] lg:col-span-2" style={{ borderColor: "var(--bt-border)" }}>
                <header className="flex items-center justify-between gap-2 border-b px-4 py-3" style={{ borderColor: "var(--bt-border)" }}>
                  <h2 className="text-sm font-semibold text-[var(--bt-text)]">Recent Activity From Your Team</h2>
                  <button type="button" className="rounded border px-2.5 py-1 text-xs font-semibold" style={{ borderColor: "var(--bt-border)" }} disabled>
                    Filter
                  </button>
                </header>
                <div className="px-4 py-3">
                  <div className="text-xs font-semibold text-[var(--bt-muted)]">Today</div>
                  <div className="mt-2 flex gap-2.5">
                    <Avatar label="DS" />
                    <div>
                      <p className="text-sm">
                        <span className="font-semibold">Damien Starkey</span> updated an Invoice
                        <span className="ml-1.5 text-xs text-[var(--bt-muted)]">2:05 PM</span>
                      </p>
                      <span className="text-sm text-[var(--bt-primary)]">Draw 2 - Remaining Contract and CO</span>
                    </div>
                  </div>
                </div>
              </section>

              <div className="flex flex-col gap-3 sm:gap-4">
                <section className="rounded-lg border bg-[var(--bt-panel-bg)] p-4 text-center" style={{ borderColor: "var(--bt-border)" }}>
                  <div className="text-4xl font-semibold tabular-nums">0</div>
                  <p className="mt-1 text-sm text-[var(--bt-muted)]">Updates shared with clients this month</p>
                  <div className="mt-4 flex flex-wrap justify-center gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold" style={{ borderColor: "var(--bt-border)" }}>
                      <span className="h-1.5 w-1.5 rounded-full bg-[var(--bt-primary)]" />
                      Client Updates
                    </span>
                    <span className="rounded-full border px-3 py-1.5 text-xs font-semibold" style={{ borderColor: "var(--bt-border)" }}>
                      Daily Logs
                    </span>
                  </div>
                </section>

                <section className="rounded-lg border bg-[var(--bt-panel-bg)]" style={{ borderColor: "var(--bt-border)" }}>
                  <header className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: "var(--bt-border)" }}>
                    <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--bt-muted)]">This Week&apos;s Agenda</h2>
                    <span className="text-xs font-medium text-[var(--bt-primary)]">View schedule</span>
                  </header>
                  <div className="flex gap-3 px-4 py-2.5">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold text-white" style={{ background: "var(--bt-primary)" }}>
                      {dayNum}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-semibold">
                        {weekday}, {monthShort} {dayNum}
                      </div>
                      <ul className="mt-1 flex flex-col gap-1">
                        <li className="flex items-center gap-1.5 text-xs text-[var(--bt-primary)]">
                          <DocumentIcon className="h-3.5 w-3.5 text-[var(--bt-muted)]" />
                          Draw 1 Deposit
                        </li>
                        <li className="flex items-center gap-1.5 text-xs text-[var(--bt-primary)]">
                          <DocumentIcon className="h-3.5 w-3.5 text-[var(--bt-muted)]" />
                          Draw 2 - Remaining Contract an…
                        </li>
                      </ul>
                    </div>
                  </div>
                </section>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
