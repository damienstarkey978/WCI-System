import Link from "next/link";
import { notFound } from "next/navigation";

import { SetupNotice } from "@/app/admin/setup-notice";
import { currentAppUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate, formatMoney } from "@/lib/format";
import { extendedCostCents, priceWithRate } from "@/lib/budget/funnel";
import { isAnthropicConfigured } from "@/lib/env";

import { ConvertToJobButton } from "../convert-form";
import { StageSelect } from "../stage-select";
import { CreateLeadProposalForm } from "./create-lead-proposal-form";
import { DraftLeadProposalForm } from "./draft-lead-proposal-form";
import { LeadActivityForm } from "./lead-activity-form";
import { declineProposalAction, sendProposalAction } from "./actions";
import { ToggleActivityButton } from "./toggle-activity-button";

export const dynamic = "force-dynamic";

const TABS = [
  { value: "general", label: "General" },
  { value: "activities", label: "Activities" },
  { value: "proposals", label: "Proposals" },
] as const;

const ACTIVITY_TYPE_LABEL: Record<string, string> = {
  CALL: "Call",
  EMAIL: "Email",
  MEETING: "Meeting",
  NOTE: "Note",
  TASK: "Task",
};

const PROPOSAL_STATUS_STYLE: Record<string, { bg: string; text: string }> = {
  DRAFT: { bg: "#e5e7eb", text: "#374151" },
  SENT: { bg: "#dbeafe", text: "#1e40af" },
  ACCEPTED: { bg: "var(--bt-status-open-bg)", text: "var(--bt-status-open-text)" },
  DECLINED: { bg: "#fee2e2", text: "#991b1b" },
};

export default async function LeadDetailPage({
  params,
  searchParams,
}: PageProps<"/leads/[leadId]">) {
  const { leadId } = await params;
  const { tab: tabRaw } = await searchParams;
  const tab = (Array.isArray(tabRaw) ? tabRaw[0] : tabRaw) ?? "general";

  let user;
  try {
    user = await currentAppUser();
  } catch (error) {
    return <SetupNotice detail={error instanceof Error ? error.message : String(error)} />;
  }
  if (!user) {
    return <SetupNotice detail="No organization found. Seed the database, then reload." />;
  }

  const lead = await db.lead.findFirst({
    where: { id: leadId, organizationId: user.organizationId },
    include: { assignedUser: true, convertedJob: { select: { id: true, name: true } } },
  });
  if (!lead) notFound();

  const [activities, proposals, costCodes] = await Promise.all([
    db.leadActivity.findMany({ where: { leadId: lead.id }, orderBy: { occurredAt: "desc" }, include: { createdByUser: true } }),
    db.proposal.findMany({
      where: { leadId: lead.id },
      orderBy: { createdAt: "desc" },
      include: {
        estimate: { include: { lineItems: true } },
        sections: { orderBy: { sortOrder: "asc" }, include: { bullets: { orderBy: { sortOrder: "asc" } } } },
      },
    }),
    db.costCode.findMany({
      where: { organizationId: user.organizationId, isActive: true },
      orderBy: { sortOrder: "asc" },
      select: { id: true, code: true, name: true },
    }),
  ]);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4 p-6">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-xl font-semibold text-[var(--bt-text)]">{lead.name}</h1>
          {lead.convertedJob ? (
            <Link href={`/jobs/${lead.convertedJob.id}`} className="text-sm font-medium text-[var(--bt-primary)] hover:underline">
              View job: {lead.convertedJob.name}
            </Link>
          ) : (
            <ConvertToJobButton leadId={lead.id} defaultName={lead.name} />
          )}
        </div>
        <Link href="/leads" className="text-xs text-[var(--bt-muted)] hover:underline">
          ← Back to lead opportunities
        </Link>
      </div>

      <nav className="flex gap-1 border-b text-sm font-medium" style={{ borderColor: "var(--bt-border)" }}>
        {TABS.map((t) => (
          <Link
            key={t.value}
            href={t.value === "general" ? `/leads/${lead.id}` : `/leads/${lead.id}?tab=${t.value}`}
            className="border-b-2 px-3 py-2.5"
            style={
              tab === t.value
                ? { borderColor: "var(--bt-active-bar)", color: "var(--bt-text)" }
                : { borderColor: "transparent", color: "var(--bt-muted)" }
            }
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {tab === "activities" ? (
        <div className="flex flex-col gap-3">
          <LeadActivityForm leadId={lead.id} />
          {activities.length === 0 ? (
            <p className="rounded-lg border bg-white px-4 py-6 text-center text-sm text-[var(--bt-muted)]" style={{ borderColor: "var(--bt-border)" }}>
              No activity logged yet.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {activities.map((activity) => (
                <div key={activity.id} className="rounded-lg border bg-white p-3" style={{ borderColor: "var(--bt-border)" }}>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--bt-muted)]">
                    <div className="flex items-center gap-2">
                      <span className="rounded bg-black/5 px-1.5 py-0.5 font-semibold text-[var(--bt-text)]">
                        {ACTIVITY_TYPE_LABEL[activity.type] ?? activity.type}
                      </span>
                      <span>{formatDate(activity.occurredAt)}</span>
                      {activity.createdByUser ? <span>· {activity.createdByUser.email}</span> : null}
                    </div>
                    {activity.type === "TASK" ? (
                      <div className="flex items-center gap-2">
                        {activity.dueDate ? <span>Due {formatDate(activity.dueDate)}</span> : null}
                        {activity.completedAt ? <span className="font-semibold text-[var(--bt-status-open-text)]">Done</span> : null}
                        <ToggleActivityButton leadId={lead.id} activityId={activity.id} completed={activity.completedAt !== null} />
                      </div>
                    ) : null}
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-[var(--bt-text)]">{activity.note}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : tab === "proposals" ? (
        <div className="flex flex-col gap-3">
          {isAnthropicConfigured() ? (
            <DraftLeadProposalForm
              leadId={lead.id}
              defaultEmail={lead.email ?? ""}
              defaultPhone={lead.phone ?? ""}
              needsContact={!lead.email}
            />
          ) : null}
          <CreateLeadProposalForm
            leadId={lead.id}
            costCodes={costCodes}
            defaultEmail={lead.email ?? ""}
            defaultPhone={lead.phone ?? ""}
            needsContact={!lead.email}
          />
          {proposals.length === 0 ? (
            <p className="rounded-lg border bg-white px-4 py-6 text-center text-sm text-[var(--bt-muted)]" style={{ borderColor: "var(--bt-border)" }}>
              No proposals yet.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {proposals.map((proposal) => {
                const style = PROPOSAL_STATUS_STYLE[proposal.status] ?? PROPOSAL_STATUS_STYLE.DRAFT;
                const totalCents = proposal.estimate.lineItems.reduce((total, item) => {
                  const cost = extendedCostCents(item.quantityMilli, item.unitCostCents);
                  return total + priceWithRate(cost, item.rateMode, item.rateBasisPoints);
                }, 0);
                return (
                  <div key={proposal.id} className="rounded-lg border bg-white p-4" style={{ borderColor: "var(--bt-border)" }}>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium text-[var(--bt-text)]">{proposal.title}</span>
                          {proposal.estimate.aiGenerated ? (
                            <span
                              className="rounded px-1.5 py-0.5 text-[10px] font-semibold"
                              style={{ background: "#ede9fe", color: "#5b21b6" }}
                            >
                              Drafted by Jarvis
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-0.5 text-xs text-[var(--bt-muted)]">{formatDate(proposal.createdAt)}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-[var(--bt-text)]">{formatMoney(totalCents)}</span>
                        <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: style.bg, color: style.text }}>
                          {proposal.status}
                        </span>
                      </div>
                    </div>
                    {proposal.coverMessage ? (
                      <p className="mt-2 whitespace-pre-wrap text-sm text-[var(--bt-text)]">{proposal.coverMessage}</p>
                    ) : null}
                    {proposal.sections.length > 0 ? (
                      <div className="mt-3 flex flex-col gap-2 border-t pt-3" style={{ borderColor: "var(--bt-border)" }}>
                        {proposal.sections.map((section) => (
                          <div key={section.id}>
                            <div className="text-xs font-semibold text-[var(--bt-text)]">{section.title}</div>
                            <ul className="mt-1 list-disc pl-4 text-sm text-[var(--bt-muted)]">
                              {section.bullets.map((bullet) => (
                                <li key={bullet.id}>{bullet.text}</li>
                              ))}
                            </ul>
                          </div>
                        ))}
                      </div>
                    ) : null}
                    {proposal.status === "DRAFT" || proposal.status === "SENT" ? (
                      <div className="mt-3 flex gap-3">
                        {proposal.status === "DRAFT" ? (
                          <form action={sendProposalAction}>
                            <input type="hidden" name="leadId" value={lead.id} />
                            <input type="hidden" name="proposalId" value={proposal.id} />
                            <button type="submit" className="rounded px-3 py-1.5 text-xs font-semibold text-white" style={{ background: "var(--bt-primary)" }}>
                              Send
                            </button>
                          </form>
                        ) : null}
                        {proposal.status === "SENT" ? (
                          <form action={declineProposalAction}>
                            <input type="hidden" name="leadId" value={lead.id} />
                            <input type="hidden" name="proposalId" value={proposal.id} />
                            <button type="submit" className="rounded border px-3 py-1.5 text-xs font-medium text-[var(--bt-muted)] hover:text-red-600" style={{ borderColor: "var(--bt-border)" }}>
                              Mark declined
                            </button>
                          </form>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-lg border bg-white p-4" style={{ borderColor: "var(--bt-border)" }}>
          <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
            <div>
              <dt className="text-xs text-[var(--bt-muted)]">Stage</dt>
              <dd className="mt-1">
                <StageSelect leadId={lead.id} stage={lead.stage} />
              </dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--bt-muted)]">Assigned to</dt>
              <dd className="text-sm text-[var(--bt-text)]">{lead.assignedUser?.email ?? "Unassigned"}</dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--bt-muted)]">Email</dt>
              <dd className="text-sm text-[var(--bt-text)]">{lead.email ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--bt-muted)]">Phone</dt>
              <dd className="text-sm text-[var(--bt-text)]">{lead.phone ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--bt-muted)]">Source</dt>
              <dd className="text-sm text-[var(--bt-text)]">{lead.source ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--bt-muted)]">Address</dt>
              <dd className="text-sm text-[var(--bt-text)]">
                {[lead.addressLine1, lead.city, lead.state, lead.postalCode].filter(Boolean).join(", ") || "—"}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs text-[var(--bt-muted)]">Notes</dt>
              <dd className="whitespace-pre-wrap text-sm text-[var(--bt-text)]">{lead.notes ?? "—"}</dd>
            </div>
          </dl>
        </div>
      )}
    </div>
  );
}
