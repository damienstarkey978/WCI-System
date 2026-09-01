"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import {
  FILES_NAV,
  FINANCIAL_NAV,
  JOBS_NAV,
  MESSAGING_NAV,
  PROJECT_MANAGEMENT_NAV,
  REPORTS_HREF,
  SALES_NAV,
  type JobNavLink,
  type JobsMenuItem,
} from "@/lib/buildertrend-nav";

import type { SidebarJob } from "./JobSidebar";
import { CloseIcon, PeopleIcon, SparkleIcon } from "./icons";

const SECTION_SUMMARY_CLASS = "flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-semibold text-[var(--bt-text)] marker:content-none";
const SECTION_ITEM_CLASS = "block px-6 py-2 text-sm text-[var(--bt-text)] hover:bg-black/5";

function FlatSection({ label, items, onNavigate }: { label: string; items: readonly { label: string; href: string }[]; onNavigate: () => void }) {
  return (
    <details className="border-b" style={{ borderColor: "var(--bt-border)" }}>
      <summary className={SECTION_SUMMARY_CLASS}>{label}</summary>
      <div className="pb-2">
        {items.map((item) => (
          <Link key={item.href} href={item.href} onClick={onNavigate} className={SECTION_ITEM_CLASS}>
            {item.label}
          </Link>
        ))}
      </div>
    </details>
  );
}

function JobScopedSection({
  label,
  items,
  activeJobId,
  onNavigate,
}: {
  label: string;
  items: readonly JobNavLink[];
  activeJobId?: string;
  onNavigate: () => void;
}) {
  return (
    <details className="border-b" style={{ borderColor: "var(--bt-border)" }}>
      <summary className={SECTION_SUMMARY_CLASS}>{label}</summary>
      <div className="pb-2">
        {!activeJobId ? (
          <p className="px-6 py-2 text-xs text-[var(--bt-muted)]">Select a job first.</p>
        ) : (
          items.map((item) => (
            <Link key={item.path} href={`/jobs/${activeJobId}${item.path}`} onClick={onNavigate} className={SECTION_ITEM_CLASS}>
              {item.label}
              {item.isNew ? <span className="ml-2 rounded bg-[var(--bt-primary)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--bt-on-primary)]">New</span> : null}
            </Link>
          ))
        )}
      </div>
    </details>
  );
}

function MixedSection({
  label,
  items,
  activeJobId,
  onNavigate,
}: {
  label: string;
  items: readonly JobsMenuItem[];
  activeJobId?: string;
  onNavigate: () => void;
}) {
  return (
    <details className="border-b" style={{ borderColor: "var(--bt-border)" }}>
      <summary className={SECTION_SUMMARY_CLASS}>{label}</summary>
      <div className="pb-2">
        {items.map((item) => {
          if (item.kind === "global") {
            return (
              <Link key={item.label} href={item.href!} onClick={onNavigate} className={SECTION_ITEM_CLASS}>
                {item.label}
              </Link>
            );
          }
          if (item.kind === "job") {
            if (!activeJobId) {
              return (
                <span key={item.label} className="block px-6 py-2 text-sm text-[var(--bt-muted)]">
                  {item.label}
                </span>
              );
            }
            return (
              <Link key={item.label} href={`/jobs/${activeJobId}${item.jobPath}`} onClick={onNavigate} className={SECTION_ITEM_CLASS}>
                {item.label}
              </Link>
            );
          }
          return (
            <span key={item.label} className="block px-6 py-2 text-sm text-[var(--bt-muted)]" title="Coming soon">
              {item.label}
            </span>
          );
        })}
      </div>
    </details>
  );
}

/**
 * The full-screen mobile nav (TopNav's hamburger, hidden at `lg` and up). Buildertrend's
 * desktop mega-dropdowns don't translate to touch — this collapses each section into a
 * native `<details>` accordion instead, plus a job jump-list, so a phone user still
 * reaches everything the desktop nav exposes without the hover/absolute-position
 * dropdown pattern.
 */
export function MobileMenuDrawer({
  open,
  onClose,
  jobs,
  activeJobId,
}: {
  open: boolean;
  onClose: () => void;
  jobs: readonly SidebarJob[];
  activeJobId?: string;
}) {
  const [jobQuery, setJobQuery] = useState("");

  const filteredJobs = useMemo(() => {
    const q = jobQuery.trim().toLowerCase();
    if (!q) return jobs;
    return jobs.filter((job) => job.name.toLowerCase().includes(q) || (job.prefix?.toLowerCase().includes(q) ?? false));
  }, [jobs, jobQuery]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="absolute inset-y-0 left-0 flex w-[85vw] max-w-sm flex-col bg-[var(--bt-panel-bg)] shadow-xl">
        <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: "var(--bt-border)" }}>
          <span className="text-sm font-semibold text-[var(--bt-text)]">Menu</span>
          <button type="button" onClick={onClose} aria-label="Close menu" className="rounded p-1.5 text-[var(--bt-muted)] hover:bg-black/5">
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <FlatSection label="Sales" items={SALES_NAV} onNavigate={onClose} />
          <MixedSection label="Jobs" items={JOBS_NAV} activeJobId={activeJobId} onNavigate={onClose} />
          <JobScopedSection label="Project Management" items={PROJECT_MANAGEMENT_NAV} activeJobId={activeJobId} onNavigate={onClose} />
          <JobScopedSection label="Files" items={FILES_NAV} activeJobId={activeJobId} onNavigate={onClose} />
          <MixedSection label="Messaging" items={MESSAGING_NAV} activeJobId={activeJobId} onNavigate={onClose} />
          <JobScopedSection label="Financial" items={FINANCIAL_NAV} activeJobId={activeJobId} onNavigate={onClose} />

          <Link href={REPORTS_HREF} onClick={onClose} className="block border-b px-4 py-3 text-sm font-semibold text-[var(--bt-text)] hover:bg-black/5" style={{ borderColor: "var(--bt-border)" }}>
            Reports
          </Link>
          <Link href="/jarvis" onClick={onClose} className="flex items-center gap-2 border-b px-4 py-3 text-sm font-semibold text-[var(--bt-text)] hover:bg-black/5" style={{ borderColor: "var(--bt-border)" }}>
            <SparkleIcon className="h-4 w-4" /> Jarvis
          </Link>
          <Link href="/people" onClick={onClose} className="flex items-center gap-2 border-b px-4 py-3 text-sm font-semibold text-[var(--bt-text)] hover:bg-black/5" style={{ borderColor: "var(--bt-border)" }}>
            <PeopleIcon className="h-4 w-4" /> People
          </Link>

          <div className="px-4 py-3">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--bt-muted)]">Jump to job</div>
            <input
              value={jobQuery}
              onChange={(event) => setJobQuery(event.target.value)}
              placeholder="Search jobs…"
              className="mb-2 w-full rounded border px-2.5 py-1.5 text-sm outline-none focus:border-[var(--bt-primary)]"
              style={{ borderColor: "var(--bt-border)" }}
            />
            <div className="flex flex-col">
              {filteredJobs.slice(0, 50).map((job) => (
                <Link
                  key={job.id}
                  href={`/jobs/${job.id}`}
                  onClick={onClose}
                  className="truncate rounded px-2 py-1.5 text-sm hover:bg-black/5"
                  style={job.id === activeJobId ? { background: "var(--bt-status-open-bg)", color: "var(--bt-status-open-text)" } : { color: "var(--bt-text)" }}
                >
                  {job.prefix ? <span className="mr-1.5 font-mono text-xs text-[var(--bt-muted)]">{job.prefix}</span> : null}
                  {job.name}
                </Link>
              ))}
              {filteredJobs.length === 0 ? <p className="px-2 py-1.5 text-sm text-[var(--bt-muted)]">No jobs match.</p> : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
