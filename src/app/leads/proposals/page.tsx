import Link from "next/link";

import { SetupNotice } from "@/app/admin/setup-notice";
import { EmptyState } from "@/components/shell/EmptyState";
import { estimateTotalCents } from "@/lib/budget/funnel";
import { currentAppUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate, formatMoney } from "@/lib/format";

export const dynamic = "force-dynamic";

const STATUS_STYLE: Record<string, { bg: string; text: string }> = {
  DRAFT: { bg: "#e5e7eb", text: "#374151" },
  SENT: { bg: "color-mix(in srgb, var(--bt-primary) 14%, transparent)", text: "var(--bt-primary)" },
  ACCEPTED: { bg: "var(--bt-status-open-bg)", text: "var(--bt-status-open-text)" },
  DECLINED: { bg: "color-mix(in srgb, var(--bt-danger) 14%, transparent)", text: "var(--bt-danger)" },
};

/**
 * Cross-lead proposal list — Buildertrend's "Lead Proposals". Creating one
 * happens from the lead's own Proposals tab (src/app/leads/[leadId]/page.tsx),
 * since a proposal always needs a specific lead's contact info; this is the
 * org-wide view across all of them, mirroring the Lead Activities feed.
 */
export default async function LeadProposalsPage() {
  let user;
  try {
    user = await currentAppUser();
  } catch (error) {
    return <SetupNotice detail={error instanceof Error ? error.message : String(error)} />;
  }
  if (!user) {
    return <SetupNotice detail="No organization found. Seed the database, then reload." />;
  }

  const proposals = await db.proposal.findMany({
    where: { organizationId: user.organizationId, leadId: { not: null } },
    orderBy: { createdAt: "desc" },
    include: { lead: { select: { id: true, name: true } }, options: { include: { estimate: { include: { lineItems: true } } } } },
  });

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 p-6">
      <h1 className="text-xl font-semibold text-[var(--bt-text)]">Lead proposals</h1>

      {proposals.length === 0 ? (
        <EmptyState title="No proposals yet" description="Proposals created from a lead will appear here." />
      ) : (
        <div className="overflow-hidden rounded-lg border bg-[var(--bt-panel-bg)]" style={{ borderColor: "var(--bt-border)" }}>
          <table className="w-full text-left text-sm">
            <thead>
              <tr
                className="border-b text-xs font-semibold uppercase tracking-wide text-[var(--bt-muted)]"
                style={{ borderColor: "var(--bt-border)" }}
              >
                <th className="px-4 py-3">Lead</th>
                <th className="px-4 py-3">Title</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {proposals.map((proposal) => {
                const style = STATUS_STYLE[proposal.status] ?? STATUS_STYLE.DRAFT;
                const optionTotals = proposal.options.map((option) => estimateTotalCents(option.estimate.lineItems));
                const totalLabel =
                  optionTotals.length <= 1
                    ? formatMoney(optionTotals[0] ?? 0)
                    : proposal.selectedOptionId
                      ? formatMoney(estimateTotalCents(proposal.options.find((o) => o.id === proposal.selectedOptionId)!.estimate.lineItems))
                      : `${formatMoney(Math.min(...optionTotals))} – ${formatMoney(Math.max(...optionTotals))}`;
                return (
                  <tr key={proposal.id} className="border-b last:border-0" style={{ borderColor: "var(--bt-border)" }}>
                    <td className="px-4 py-3">
                      {proposal.lead ? (
                        <Link href={`/leads/${proposal.lead.id}?tab=proposals`} className="font-medium text-[var(--bt-primary)] hover:underline">
                          {proposal.lead.name}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/leads/proposals/${proposal.id}`} className="font-medium text-[var(--bt-text)] hover:underline">
                        {proposal.title}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: style.bg, color: style.text }}>
                        {proposal.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[var(--bt-muted)]">{formatDate(proposal.createdAt)}</td>
                    <td className="px-4 py-3 text-right text-[var(--bt-text)]">{totalLabel}</td>
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
