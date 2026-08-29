import Link from "next/link";

import { SetupNotice } from "@/app/admin/setup-notice";
import { currentAppUserOrRedirect } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate, formatMoney } from "@/lib/format";

import { AddLeadOpportunityModal } from "./add-lead-opportunity-modal";
import { StageSelect } from "./stage-select";

export const dynamic = "force-dynamic";

const STAGE_STYLE: Record<string, { bg: string; text: string }> = {
  NEW: { bg: "#e5e7eb", text: "#374151" },
  CONTACTED: { bg: "#dbeafe", text: "#1e40af" },
  QUALIFIED: { bg: "#fef3c7", text: "#92400e" },
  PROPOSAL_SENT: { bg: "#ede9fe", text: "#5b21b6" },
  WON: { bg: "var(--bt-status-open-bg)", text: "var(--bt-status-open-text)" },
  LOST: { bg: "#fee2e2", text: "#991b1b" },
};

function ageDays(createdAt: Date): number {
  return Math.max(0, Math.floor((Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24)));
}

/**
 * Buildertrend-match "Lead Opportunities" list — a flat sortable-by-column table
 * (Title / Client Contact / Created Date / Lead Status / Age / Confidence / Est.
 * Revenue Min / Max), replacing the earlier ad-hoc Kanban-by-stage board. Stage is
 * still changeable inline (StageSelect) — Buildertrend's own list doesn't show a
 * separate pipeline column, but dropping the ability to change it would be a real
 * regression, not just a cosmetic one.
 */
export default async function LeadsPage() {
  let user;
  try {
    user = await currentAppUserOrRedirect();
  } catch (error) {
    return <SetupNotice detail={error instanceof Error ? error.message : String(error)} />;
  }

  const [leads, clients] = await Promise.all([
    db.lead.findMany({ where: { organizationId: user.organizationId }, orderBy: { createdAt: "desc" } }),
    db.client.findMany({ where: { organizationId: user.organizationId }, orderBy: { name: "asc" }, select: { id: true, name: true, email: true } }),
  ]);

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-[var(--bt-text)]">Lead opportunities</h1>
      </div>

      <AddLeadOpportunityModal clients={clients} />

      {leads.length === 0 ? (
        <p className="rounded-lg border bg-[var(--bt-panel-bg)] px-4 py-6 text-center text-sm text-[var(--bt-muted)]" style={{ borderColor: "var(--bt-border)" }}>
          No lead opportunities yet.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-[var(--bt-panel-bg)]" style={{ borderColor: "var(--bt-border)" }}>
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b text-xs font-semibold uppercase tracking-wide text-[var(--bt-muted)]" style={{ borderColor: "var(--bt-border)" }}>
                <th className="whitespace-nowrap px-4 py-3">Title</th>
                <th className="whitespace-nowrap px-4 py-3">Client contact</th>
                <th className="whitespace-nowrap px-4 py-3">Created date</th>
                <th className="whitespace-nowrap px-4 py-3">Lead status</th>
                <th className="whitespace-nowrap px-4 py-3 text-right">Age</th>
                <th className="whitespace-nowrap px-4 py-3 text-right">Confidence</th>
                <th className="whitespace-nowrap px-4 py-3 text-right">Est. revenue min</th>
                <th className="whitespace-nowrap px-4 py-3 text-right">Est. revenue max</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => {
                const style = STAGE_STYLE[lead.stage] ?? STAGE_STYLE.NEW;
                return (
                  <tr key={lead.id} className="border-b last:border-0" style={{ borderColor: "var(--bt-border)" }}>
                    <td className="whitespace-nowrap px-4 py-3">
                      <Link href={`/leads/${lead.id}`} className="font-medium text-[var(--bt-primary)] hover:underline">
                        {lead.title ?? lead.name}
                      </Link>
                      {lead.convertedJobId ? (
                        <div className="text-[10px] font-semibold text-[var(--bt-status-open-text)]">Converted</div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-[var(--bt-muted)]">
                      {lead.name}
                      {lead.email ? <div className="text-xs">{lead.email}</div> : null}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-[var(--bt-muted)]">{formatDate(lead.createdAt)}</td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <StageSelect leadId={lead.id} stage={lead.stage} />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-[var(--bt-muted)]">{ageDays(lead.createdAt)} days</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="h-1.5 w-16 overflow-hidden rounded-full bg-black/10">
                          <div className="h-full rounded-full" style={{ width: `${lead.confidencePercent}%`, background: "var(--bt-primary)" }} />
                        </div>
                        <span className="text-[var(--bt-text)]">{lead.confidencePercent}%</span>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-[var(--bt-text)]">
                      {lead.estimatedRevenueMinCents !== null ? formatMoney(lead.estimatedRevenueMinCents) : "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-[var(--bt-text)]">
                      {lead.estimatedRevenueMaxCents !== null ? formatMoney(lead.estimatedRevenueMaxCents) : "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: style.bg, color: style.text }}>
                        {lead.stage.replace(/_/g, " ")}
                      </span>
                    </td>
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
