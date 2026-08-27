import Link from "next/link";

import { HomeIcon } from "./icons";

export interface SidebarJob {
  readonly id: string;
  readonly name: string;
  readonly prefix: string | null;
  readonly status: string;
  /** Falls back to "General" when the job has no JobGroup — matches Buildertrend's default bucket. */
  readonly groupName: string;
}

/**
 * Left panel used both on the /jobs index (no active job) and inside a job's own
 * layout (active job's mini-card pinned above the grouped job list) — the single
 * component the shared AppShell composes with TopNav, per CLAUDE.md's shell plan.
 */
export function JobSidebar({ jobs, activeJobId }: { jobs: SidebarJob[]; activeJobId?: string }) {
  const activeJob = activeJobId ? jobs.find((job) => job.id === activeJobId) : undefined;

  const groups = new Map<string, SidebarJob[]>();
  for (const job of jobs) {
    const bucket = groups.get(job.groupName) ?? [];
    bucket.push(job);
    groups.set(job.groupName, bucket);
  }

  return (
    <aside
      className="flex w-64 shrink-0 flex-col border-r bg-[var(--bt-sidebar-bg)]"
      style={{ borderColor: "var(--bt-border)" }}
    >
      {activeJob ? (
        <Link
          href={`/jobs/${activeJob.id}`}
          className="flex flex-col gap-1 border-b px-4 py-3"
          style={{ borderColor: "var(--bt-border)" }}
        >
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-[var(--bt-muted)]">
            <HomeIcon className="h-3.5 w-3.5" />
            Current job
          </div>
          <div className="truncate text-sm font-semibold text-[var(--bt-text)]">{activeJob.name}</div>
          <span
            className="w-fit rounded px-1.5 py-0.5 text-[10px] font-semibold"
            style={{ background: "var(--bt-status-open-bg)", color: "var(--bt-status-open-text)" }}
          >
            {activeJob.status.replace(/_/g, " ")}
          </span>
        </Link>
      ) : null}

      <div className="flex-1 overflow-y-auto py-2">
        {[...groups.entries()].map(([groupName, groupJobs]) => (
          <div key={groupName} className="mb-3">
            <div className="px-4 py-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--bt-muted)]">
              {groupName}
            </div>
            {groupJobs.map((job) => {
              const isActive = job.id === activeJobId;
              return (
                <Link
                  key={job.id}
                  href={`/jobs/${job.id}`}
                  className="block truncate px-4 py-1.5 text-sm transition"
                  style={
                    isActive
                      ? { background: "var(--bt-status-open-bg)", color: "var(--bt-status-open-text)" }
                      : { color: "var(--bt-text)" }
                  }
                >
                  {job.prefix ? <span className="mr-1.5 font-mono text-xs text-[var(--bt-muted)]">{job.prefix}</span> : null}
                  {job.name}
                </Link>
              );
            })}
          </div>
        ))}

        {jobs.length === 0 ? <p className="px-4 py-2 text-sm text-[var(--bt-muted)]">No jobs yet.</p> : null}
      </div>
    </aside>
  );
}
