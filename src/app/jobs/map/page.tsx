import Link from "next/link";

import { AppShell } from "@/components/shell/AppShell";
import { notificationBellDataForUser, sidebarJobsForOrg } from "@/components/shell/data";
import { SetupNotice } from "@/app/admin/setup-notice";
import { currentAppUserOrRedirect } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  PRE_SALE: "Pre-sale",
  OPEN: "Open",
  WARRANTY: "Warranty",
  CLOSED: "Closed",
};

/**
 * "Jobs Map" (per Damien's screenshot, 2026-08-29) — a real, working stand-in for
 * Buildertrend's interactive map view rather than a fake embed: an actual map needs a
 * geocoding/tiles provider (API key, billing) this codebase doesn't have configured,
 * so this lists every job with an address and links out to Google's plain search URL
 * (no API key required) instead of pretending to have map pins. Self-wraps in AppShell
 * exactly like the sibling /jobs/page.tsx does — there's no /jobs/layout.tsx (it would
 * double-wrap /jobs/[jobId]'s own StaffShell), so every non-[jobId] page under /jobs
 * does this itself.
 */
export default async function JobsMapPage() {
  let user;
  try {
    user = await currentAppUserOrRedirect();
  } catch (error) {
    return <SetupNotice detail={error instanceof Error ? error.message : String(error)} />;
  }

  const [jobs, bell, jobRows] = await Promise.all([
    sidebarJobsForOrg(user.organizationId, user),
    notificationBellDataForUser(user.organizationId, user.id),
    db.job.findMany({
      where: { organizationId: user.organizationId, isTemplate: false },
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, status: true, addressLine1: true, city: true, state: true, postalCode: true },
    }),
  ]);

  return (
    <AppShell jobs={jobs} notifications={bell.notifications} unreadCount={bell.unreadCount}>
      <div className="mx-auto flex max-w-4xl flex-col gap-4 p-6">
        <h1 className="text-xl font-semibold text-[var(--bt-text)]">Jobs Map</h1>

        <div className="overflow-hidden rounded-lg border bg-[var(--bt-panel-bg)]" style={{ borderColor: "var(--bt-border)" }}>
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b text-xs font-semibold uppercase tracking-wide text-[var(--bt-muted)]" style={{ borderColor: "var(--bt-border)" }}>
                <th className="px-4 py-3">Job</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Address</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {jobRows.map((job) => {
                const address = [job.addressLine1, job.city, job.state, job.postalCode].filter(Boolean).join(", ");
                return (
                  <tr key={job.id} className="border-b last:border-0" style={{ borderColor: "var(--bt-border)" }}>
                    <td className="px-4 py-3 font-medium text-[var(--bt-text)]">
                      <Link href={`/jobs/${job.id}`} className="hover:underline">
                        {job.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-[var(--bt-muted)]">{STATUS_LABEL[job.status] ?? job.status}</td>
                    <td className="px-4 py-3 text-[var(--bt-text)]">{address || "—"}</td>
                    <td className="px-4 py-3 text-right">
                      {address ? (
                        <a
                          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs font-medium text-[var(--bt-primary)] hover:underline"
                        >
                          View on map →
                        </a>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}
