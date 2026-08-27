import Link from "next/link";

import { AppShell } from "@/components/shell/AppShell";
import { sidebarJobsForOrg } from "@/components/shell/data";
import { SetupNotice } from "@/app/admin/setup-notice";
import { currentAppUserOrRedirect } from "@/lib/auth";

// Reads live data on every request — never prerendered at build time.
export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  PRE_SALE: "Pre-sale",
  OPEN: "Open",
  WARRANTY: "Warranty",
  CLOSED: "Closed",
};

export default async function JobsIndexPage() {
  let user;
  try {
    user = await currentAppUserOrRedirect();
  } catch (error) {
    return <SetupNotice detail={error instanceof Error ? error.message : String(error)} />;
  }

  const jobs = await sidebarJobsForOrg(user.organizationId);

  return (
    <AppShell jobs={jobs}>
      <div className="mx-auto flex max-w-6xl flex-col gap-4 p-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-[var(--bt-text)]">Jobs</h1>
          <Link
            href="/admin/jobs"
            className="rounded px-4 py-2 text-sm font-semibold text-white"
            style={{ background: "var(--bt-primary)" }}
          >
            + New job
          </Link>
        </div>

        <div className="overflow-hidden rounded-lg border bg-white" style={{ borderColor: "var(--bt-border)" }}>
          <table className="w-full text-left text-sm">
            <thead>
              <tr
                className="border-b text-xs font-semibold uppercase tracking-wide text-[var(--bt-muted)]"
                style={{ borderColor: "var(--bt-border)" }}
              >
                <th className="px-4 py-3">Job</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Group</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr key={job.id} className="border-b last:border-0" style={{ borderColor: "var(--bt-border)" }}>
                  <td className="px-4 py-3">
                    <Link href={`/jobs/${job.id}`} className="font-medium text-[var(--bt-primary)] hover:underline">
                      {job.prefix ? <span className="mr-1.5 font-mono text-xs text-[var(--bt-muted)]">{job.prefix}</span> : null}
                      {job.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className="rounded px-1.5 py-0.5 text-xs font-semibold"
                      style={{ background: "var(--bt-status-open-bg)", color: "var(--bt-status-open-text)" }}
                    >
                      {STATUS_LABEL[job.status] ?? job.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[var(--bt-muted)]">{job.groupName}</td>
                </tr>
              ))}
              {jobs.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-6 text-center text-[var(--bt-muted)]">
                    No jobs yet. Create one from the admin screen.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}
