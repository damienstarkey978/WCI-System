import Link from "next/link";
import { notFound } from "next/navigation";

import { contractTypePolicy } from "@/lib/contract-type";
import { currentAppUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { resolveFileUrl } from "@/lib/files/service";
import { formatDate, formatMoney } from "@/lib/format";
import { SetupNotice } from "@/app/admin/setup-notice";
import { InfoIcon } from "@/components/shell/icons";
import { PhotoStrip } from "@/components/files/PhotoStrip";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  PRE_SALE: "Pre-sale",
  OPEN: "Open",
  WARRANTY: "Warranty",
  CLOSED: "Closed",
};

export default async function JobOverviewPage({ params }: PageProps<"/jobs/[jobId]">) {
  const { jobId } = await params;

  let user;
  try {
    user = await currentAppUser();
  } catch (error) {
    return <SetupNotice detail={error instanceof Error ? error.message : String(error)} />;
  }
  if (!user) {
    return <SetupNotice detail="No organization found. Seed the database, then reload." />;
  }

  const job = await db.job.findFirst({
    where: { id: jobId, organizationId: user.organizationId },
    include: {
      jobGroup: true,
      clientAccess: { include: { client: true } },
    },
  });
  if (!job) notFound();

  const [recentLogs, openTodos, unapprovedShifts, invoices] = await Promise.all([
    db.dailyLog.findMany({
      where: { jobId: job.id },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { authorUser: true, files: true },
    }),
    db.todo.findMany({
      where: { jobId: job.id, status: { in: ["OPEN", "IN_PROGRESS"] } },
      orderBy: { dueDate: "asc" },
      take: 5,
    }),
    db.timeClockEntry.count({ where: { jobId: job.id, approvalStatus: "PENDING" } }),
    db.invoice.findMany({
      where: { jobId: job.id, status: { in: ["SENT", "PARTIALLY_PAID"] } },
      orderBy: { dueOn: "asc" },
      take: 5,
    }),
  ]);

  const recentLogsWithPhotos = await Promise.all(
    recentLogs.map(async (log) => ({
      ...log,
      photos: await Promise.all(
        log.files.map(async (file) => ({ id: file.id, fileName: file.fileName, category: file.category, url: await resolveFileUrl(file.url) })),
      ),
    })),
  );

  const address = [job.addressLine1, job.city, job.state].filter(Boolean).join(", ");

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 p-6">
      <div className="rounded-lg border bg-[var(--bt-panel-bg)] p-5" style={{ borderColor: "var(--bt-border)" }}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold text-[var(--bt-text)]">{job.name}</h1>
              <span
                className="rounded px-1.5 py-0.5 text-xs font-semibold"
                style={{ background: "var(--bt-status-open-bg)", color: "var(--bt-status-open-text)" }}
              >
                {STATUS_LABEL[job.status] ?? job.status}
              </span>
            </div>
            {address ? <p className="mt-1 text-sm text-[var(--bt-muted)]">{address}</p> : null}
            <dl className="mt-3 grid grid-cols-2 gap-x-8 gap-y-1 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-xs text-[var(--bt-muted)]">Prefix</dt>
                <dd className="font-mono text-[var(--bt-text)]">{job.prefix ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-[var(--bt-muted)]">Contract</dt>
                <dd className="text-[var(--bt-text)]">{contractTypePolicy(job.contractType).label}</dd>
              </div>
              <div>
                <dt className="text-xs text-[var(--bt-muted)]">Start</dt>
                <dd className="text-[var(--bt-text)]">{formatDate(job.projectedStart)}</dd>
              </div>
              <div>
                <dt className="text-xs text-[var(--bt-muted)]">Est. completion</dt>
                <dd className="text-[var(--bt-text)]">{formatDate(job.projectedEnd)}</dd>
              </div>
            </dl>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <section className="rounded-lg border bg-[var(--bt-panel-bg)]" style={{ borderColor: "var(--bt-border)" }}>
            <header
              className="flex items-center justify-between border-b px-4 py-3"
              style={{ borderColor: "var(--bt-border)" }}
            >
              <h2 className="text-sm font-semibold text-[var(--bt-text)]">Recent daily logs</h2>
              <Link href={`/jobs/${job.id}/daily-logs`} className="text-xs font-medium text-[var(--bt-primary)] hover:underline">
                View all
              </Link>
            </header>
            <div className="divide-y" style={{ borderColor: "var(--bt-border)" }}>
              {recentLogsWithPhotos.length === 0 ? (
                <p className="px-4 py-6 text-sm text-[var(--bt-muted)]">No daily logs yet.</p>
              ) : (
                recentLogsWithPhotos.map((log) => (
                  <div key={log.id} className="px-4 py-3">
                    <div className="flex items-center justify-between text-xs text-[var(--bt-muted)]">
                      <span>{log.authorUser.email}</span>
                      <span>{formatDate(log.createdAt)}</span>
                    </div>
                    <p className="mt-1 truncate text-sm text-[var(--bt-text)]">{log.note}</p>
                    <PhotoStrip files={log.photos} />
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="rounded-lg border bg-[var(--bt-panel-bg)]" style={{ borderColor: "var(--bt-border)" }}>
            <header
              className="flex items-center justify-between border-b px-4 py-3"
              style={{ borderColor: "var(--bt-border)" }}
            >
              <h2 className="text-sm font-semibold text-[var(--bt-text)]">Open to-dos</h2>
              <Link href={`/jobs/${job.id}/tasks`} className="text-xs font-medium text-[var(--bt-primary)] hover:underline">
                View all
              </Link>
            </header>
            <div className="divide-y" style={{ borderColor: "var(--bt-border)" }}>
              {openTodos.length === 0 ? (
                <p className="px-4 py-6 text-sm text-[var(--bt-muted)]">Nothing open.</p>
              ) : (
                openTodos.map((todo) => (
                  <div key={todo.id} className="flex items-center justify-between px-4 py-3">
                    <span className="text-sm text-[var(--bt-text)]">{todo.title}</span>
                    <span className="text-xs text-[var(--bt-muted)]">{formatDate(todo.dueDate)}</span>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>

        <div className="flex flex-col gap-4">
          <section className="rounded-lg border bg-[var(--bt-panel-bg)]" style={{ borderColor: "var(--bt-border)" }}>
            <header className="border-b px-4 py-3" style={{ borderColor: "var(--bt-border)" }}>
              <h2 className="text-sm font-semibold text-[var(--bt-text)]">Action items</h2>
            </header>
            <div className="px-4 py-3 text-sm text-[var(--bt-text)]">
              {unapprovedShifts > 0 ? (
                <div className="flex items-center gap-2">
                  <InfoIcon className="h-4 w-4 shrink-0 text-amber-600" />
                  <Link href={`/jobs/${job.id}/time-clock`} className="hover:underline">
                    {unapprovedShifts} unapproved {unapprovedShifts === 1 ? "shift" : "shifts"}
                  </Link>
                </div>
              ) : (
                <p className="text-[var(--bt-muted)]">Nothing needs your attention.</p>
              )}
            </div>
          </section>

          <section className="rounded-lg border bg-[var(--bt-panel-bg)]" style={{ borderColor: "var(--bt-border)" }}>
            <header className="border-b px-4 py-3" style={{ borderColor: "var(--bt-border)" }}>
              <h2 className="text-sm font-semibold text-[var(--bt-text)]">Clients</h2>
            </header>
            <div className="divide-y" style={{ borderColor: "var(--bt-border)" }}>
              {job.clientAccess.length === 0 ? (
                <p className="px-4 py-3 text-sm text-[var(--bt-muted)]">No clients on this job.</p>
              ) : (
                job.clientAccess.map((access) => (
                  <div key={access.id} className="px-4 py-3">
                    <div className="text-sm font-medium text-[var(--bt-text)]">{access.client.name}</div>
                    <div className="text-xs text-[var(--bt-muted)]">{access.client.email}</div>
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="rounded-lg border bg-[var(--bt-panel-bg)]" style={{ borderColor: "var(--bt-border)" }}>
            <header
              className="flex items-center justify-between border-b px-4 py-3"
              style={{ borderColor: "var(--bt-border)" }}
            >
              <h2 className="text-sm font-semibold text-[var(--bt-text)]">Open invoices</h2>
              <Link href={`/jobs/${job.id}/budget`} className="text-xs font-medium text-[var(--bt-primary)] hover:underline">
                Financial
              </Link>
            </header>
            <div className="divide-y" style={{ borderColor: "var(--bt-border)" }}>
              {invoices.length === 0 ? (
                <p className="px-4 py-3 text-sm text-[var(--bt-muted)]">No open invoices.</p>
              ) : (
                invoices.map((invoice) => (
                  <div key={invoice.id} className="flex items-center justify-between px-4 py-3">
                    <span className="text-sm text-[var(--bt-text)]">{invoice.invoiceNumber}</span>
                    <span className="text-sm font-medium text-[var(--bt-text)]">{formatMoney(invoice.amountCents)}</span>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
