import Link from "next/link";
import { redirect } from "next/navigation";

import { currentPortalSession } from "@/lib/client-portal/browser-session";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  PRE_SALE: "Pre-sale",
  OPEN: "Open",
  WARRANTY: "Warranty",
  CLOSED: "Closed",
};

export default async function PortalJobsPage() {
  const session = await currentPortalSession();
  if (!session) redirect("/portal");

  const access = await db.clientJobAccess.findMany({
    where: { clientId: session.clientId },
    include: { job: { select: { id: true, name: true, status: true, addressLine1: true, city: true, state: true } } },
  });

  if (access.length === 1) redirect(`/portal/jobs/${access[0].job.id}`);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 p-6">
      <h1 className="text-xl font-semibold text-[var(--bt-text)]">Your jobs</h1>
      <div className="grid gap-3 sm:grid-cols-2">
        {access.map(({ job }) => (
          <Link
            key={job.id}
            href={`/portal/jobs/${job.id}`}
            className="rounded-lg border bg-[var(--bt-panel-bg)] p-4 transition hover:border-[var(--bt-primary)]"
            style={{ borderColor: "var(--bt-border)" }}
          >
            <div className="font-medium text-[var(--bt-text)]">{job.name}</div>
            <div className="mt-1 text-xs text-[var(--bt-muted)]">
              {[job.addressLine1, job.city, job.state].filter(Boolean).join(", ") || "—"}
            </div>
            <span
              className="mt-2 inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold"
              style={{ background: "var(--bt-status-open-bg)", color: "var(--bt-status-open-text)" }}
            >
              {STATUS_LABEL[job.status] ?? job.status}
            </span>
          </Link>
        ))}
        {access.length === 0 ? <p className="text-sm text-[var(--bt-muted)]">No jobs are shared with you yet.</p> : null}
      </div>
    </div>
  );
}
