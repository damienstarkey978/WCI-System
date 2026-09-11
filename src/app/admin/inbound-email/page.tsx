import Link from "next/link";

import { SetupNotice } from "@/app/admin/setup-notice";
import { EmptyState } from "@/components/shell/EmptyState";
import { currentAppUser } from "@/lib/auth";
import { billingInboxAddress } from "@/lib/bills/intake";
import { db } from "@/lib/db";
import { inboundEmailDomain, isInboundEmailConfigured } from "@/lib/env";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

const STATUS_STYLE: Record<string, { bg: string; text: string }> = {
  ROUTED: { bg: "var(--bt-status-open-bg)", text: "var(--bt-status-open-text)" },
  UNROUTED: { bg: "color-mix(in srgb, var(--bt-hazard) 14%, transparent)", text: "var(--bt-hazard)" },
  FAILED: { bg: "color-mix(in srgb, var(--bt-danger) 14%, transparent)", text: "var(--bt-danger)" },
};

/**
 * Triage for forwarded bill email.
 *
 * Unrouted mail is the reason this page exists: someone mistyped an address and is
 * waiting for their bill to appear, and without somewhere to look, that email is
 * indistinguishable from one that was never sent. Everything routed is listed too,
 * as the audit trail for where an emailed bill came from.
 *
 * Deliberately org-wide rather than per-job — an unrouted email has no job by
 * definition, so a job-scoped screen could never show the rows that matter most.
 */
export default async function InboundEmailPage() {
  let user;
  try {
    user = await currentAppUser();
  } catch (error) {
    return <SetupNotice detail={error instanceof Error ? error.message : String(error)} />;
  }
  if (!user) return <SetupNotice detail="No organization found. Seed the database, then reload." />;

  const [organization, emails] = await Promise.all([
    db.organization.findUniqueOrThrow({ where: { id: user.organizationId }, select: { slug: true } }),
    db.inboundEmail.findMany({
      // Unrouted mail belongs to no organization, so it would be invisible under a
      // strict org filter — exactly the rows someone is waiting on.
      where: { OR: [{ organizationId: user.organizationId }, { organizationId: null }] },
      orderBy: { receivedAt: "desc" },
      take: 100,
      include: {
        job: { select: { id: true, name: true } },
        _count: { select: { bills: true } },
      },
    }),
  ]);

  const address = billingInboxAddress(organization.slug, inboundEmailDomain());

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 p-6">
      <div>
        <h1 className="text-xl font-semibold text-[var(--bt-text)]">Forwarded bill email</h1>
        <p className="mt-1 text-sm text-[var(--bt-muted)]">
          Anything sent to <span className="font-mono text-[var(--bt-text)]">{address}</span> lands in the Bills Inbox
          for review. Nothing arriving by email is ever approved or paid on its own.
        </p>
      </div>

      {!isInboundEmailConfigured() ? (
        <p
          className="rounded-lg border px-3 py-2 text-sm"
          style={{
            borderColor: "var(--bt-hazard)",
            background: "color-mix(in srgb, var(--bt-hazard) 8%, transparent)",
            color: "var(--bt-text)",
          }}
        >
          Inbound email isn&apos;t configured on this deployment — <code>SENDGRID_INBOUND_SECRET</code> is unset, so the
          webhook refuses every delivery. Mail sent to the address above is not being received.
        </p>
      ) : null}

      {emails.length === 0 ? (
        <EmptyState
          title="No forwarded email yet"
          description="Bills forwarded to the address above will be listed here, routed or not."
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-[var(--bt-panel-bg)]" style={{ borderColor: "var(--bt-border)" }}>
          <table className="w-full min-w-max text-left text-sm">
            <thead>
              <tr
                className="border-b text-xs font-semibold uppercase tracking-wide text-[var(--bt-muted)]"
                style={{ borderColor: "var(--bt-border)" }}
              >
                <th className="px-4 py-3">Received</th>
                <th className="px-4 py-3">From</th>
                <th className="px-4 py-3">Subject</th>
                <th className="px-4 py-3">Sent to</th>
                <th className="px-4 py-3">Job</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Bills</th>
              </tr>
            </thead>
            <tbody>
              {emails.map((email) => {
                const style = STATUS_STYLE[email.status] ?? STATUS_STYLE.UNROUTED;
                return (
                  <tr key={email.id} className="border-b align-top last:border-0" style={{ borderColor: "var(--bt-border)" }}>
                    <td className="px-4 py-3 text-[var(--bt-muted)]">{formatDate(email.receivedAt)}</td>
                    <td className="px-4 py-3 text-[var(--bt-text)]">{email.fromAddress}</td>
                    <td className="px-4 py-3">
                      <div className="text-[var(--bt-text)]">{email.subject ?? "(no subject)"}</div>
                      {email.note ? <div className="mt-0.5 text-xs text-[var(--bt-muted)]">{email.note}</div> : null}
                      {email.storedPaths.length > 0 ? (
                        <div className="mt-0.5 text-xs text-[var(--bt-muted)]">
                          {email.storedPaths.length} attachment(s) held in storage
                        </div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-[var(--bt-muted)]">{email.toAddress}</td>
                    <td className="px-4 py-3">
                      {email.job ? (
                        <Link href={`/jobs/${email.job.id}/bills`} className="hover:underline" style={{ color: "var(--bt-primary)" }}>
                          {email.job.name}
                        </Link>
                      ) : (
                        <span className="text-[var(--bt-muted)]">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: style.bg, color: style.text }}>
                        {email.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-[var(--bt-text)]">{email._count.bills}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
