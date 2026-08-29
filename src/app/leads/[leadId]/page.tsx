import Link from "next/link";
import { notFound } from "next/navigation";

import { SetupNotice } from "@/app/admin/setup-notice";
import { JarvisChatPanel } from "@/components/jarvis/JarvisChatPanel";
import { currentAppUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { resolveFileUrl } from "@/lib/files/service";
import { formatDate, formatMoney } from "@/lib/format";
import { estimateTotalCents } from "@/lib/budget/funnel";
import { isAnthropicConfigured } from "@/lib/env";

import { ConvertToJobButton } from "../convert-form";
import { StageSelect } from "../stage-select";
import { CreateLeadProposalForm } from "./create-lead-proposal-form";
import { LeadActivityForm } from "./lead-activity-form";
import { LeadDetailsForm } from "./lead-details-form";
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
        options: { orderBy: { sortOrder: "asc" }, include: { estimate: { include: { lineItems: true } } } },
        sections: { orderBy: { sortOrder: "asc" }, include: { bullets: { orderBy: { sortOrder: "asc" } } } },
      },
    }),
    db.costCode.findMany({
      where: { organizationId: user.organizationId, isActive: true },
      orderBy: { sortOrder: "asc" },
      select: { id: true, code: true, name: true },
    }),
  ]);

  const preSalePhotoFiles = lead.convertedJob
    ? await db.file.findMany({
        where: { jobId: lead.convertedJob.id, category: "PRESALE_PHOTO" },
        orderBy: { createdAt: "asc" },
        select: { id: true, fileName: true, url: true },
      })
    : [];
  const preSalePhotos = await Promise.all(
    preSalePhotoFiles.map(async (photo) => ({
      id: photo.id,
      fileName: photo.fileName,
      url: await resolveFileUrl(photo.url).catch(() => null),
    })),
  );

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4 p-6">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-xl font-semibold text-[var(--bt-text)]">{lead.title ?? lead.name}</h1>
            <p className="text-xs text-[var(--bt-muted)]">
              {lead.name}
              {lead.email ? ` · ${lead.email}` : ""}
            </p>
          </div>
          {lead.convertedJob ? (
            <Link href={`/jobs/${lead.convertedJob.id}`} className="text-sm font-medium text-[var(--bt-primary)] hover:underline">
              View job: {lead.convertedJob.name}
            </Link>
          ) : (
            <ConvertToJobButton leadId={lead.id} defaultName={lead.title ?? lead.name} />
          )}
        </div>
        <Link href="/leads" className="text-xs text-[var(--bt-muted)] hover:underline">
          ← Back to lead opportunities
        </Link>
      </div>

      <nav className="flex gap-1 overflow-x-auto border-b text-sm font-medium" style={{ borderColor: "var(--bt-border)" }}>
        {TABS.map((t) => (
          <Link
            key={t.value}
            href={t.value === "general" ? `/leads/${lead.id}` : `/leads/${lead.id}?tab=${t.value}`}
            className="shrink-0 border-b-2 px-3 py-2.5 whitespace-nowrap"
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
            <p className="rounded-lg border bg-[var(--bt-panel-bg)] px-4 py-6 text-center text-sm text-[var(--bt-muted)]" style={{ borderColor: "var(--bt-border)" }}>
              No activity logged yet.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {activities.map((activity) => (
                <div key={activity.id} className="rounded-lg border bg-[var(--bt-panel-bg)] p-3" style={{ borderColor: "var(--bt-border)" }}>
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
          {preSalePhotos.length > 0 ? (
            <div className="rounded-lg border bg-[var(--bt-panel-bg)] p-4" style={{ borderColor: "var(--bt-border)" }}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-[var(--bt-muted)]">Pre-Sale Photos</span>
                {lead.convertedJob ? (
                  <Link href={`/jobs/${lead.convertedJob.id}/files?category=PRESALE_PHOTO`} className="text-xs text-[var(--bt-primary)] hover:underline">
                    Manage in Files →
                  </Link>
                ) : null}
              </div>
              <div className="mt-1.5 flex gap-2 overflow-x-auto pb-1">
                {preSalePhotos.map((photo) =>
                  photo.url ? (
                    <a key={photo.id} href={photo.url} target="_blank" rel="noreferrer" className="block h-20 w-20 shrink-0 overflow-hidden rounded border" style={{ borderColor: "var(--bt-border)" }}>
                      {/* eslint-disable-next-line @next/next/no-img-element -- signed URLs are short-lived and per-request, not suited to next/image's caching */}
                      <img src={photo.url} alt={photo.fileName} className="h-full w-full object-cover" />
                    </a>
                  ) : null,
                )}
              </div>
            </div>
          ) : null}
          {isAnthropicConfigured() ? (
            <JarvisChatPanel
              context={{ page: "lead_detail", leadId: lead.id, leadName: lead.name, tab: "proposals" }}
              storageKey={`lead-proposal:${lead.id}`}
              emptyStateHint="Give Jarvis the scope of work, measurements, and any photos — it drafts a full line-item estimate and the client-facing proposal that goes with it, always as a DRAFT for you to review before anything is sent."
              heightClassName="h-96"
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
            <p className="rounded-lg border bg-[var(--bt-panel-bg)] px-4 py-6 text-center text-sm text-[var(--bt-muted)]" style={{ borderColor: "var(--bt-border)" }}>
              No proposals yet.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {proposals.map((proposal) => {
                const style = PROPOSAL_STATUS_STYLE[proposal.status] ?? PROPOSAL_STATUS_STYLE.DRAFT;
                const optionTotals = proposal.options.map((option) => estimateTotalCents(option.estimate.lineItems));
                const totalLabel =
                  optionTotals.length <= 1
                    ? formatMoney(optionTotals[0] ?? 0)
                    : proposal.selectedOptionId
                      ? formatMoney(estimateTotalCents(proposal.options.find((o) => o.id === proposal.selectedOptionId)!.estimate.lineItems))
                      : `${formatMoney(Math.min(...optionTotals))} – ${formatMoney(Math.max(...optionTotals))}`;
                const aiGenerated = proposal.options.some((option) => option.estimate.aiGenerated);
                return (
                  <div key={proposal.id} className="rounded-lg border bg-[var(--bt-panel-bg)] p-4" style={{ borderColor: "var(--bt-border)" }}>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <Link href={`/leads/proposals/${proposal.id}`} className="font-medium text-[var(--bt-text)] hover:underline">
                            {proposal.title}
                          </Link>
                          {proposal.options.length > 1 ? (
                            <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: "#dbeafe", color: "#1e40af" }}>
                              {proposal.options.length} options
                            </span>
                          ) : null}
                          {aiGenerated ? (
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
                        <span className="text-sm font-semibold text-[var(--bt-text)]">{totalLabel}</span>
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
        <div className="rounded-lg border bg-[var(--bt-panel-bg)] p-4" style={{ borderColor: "var(--bt-border)" }}>
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
            <div>
              <dt className="text-xs text-[var(--bt-muted)]">Confidence</dt>
              <dd className="text-sm text-[var(--bt-text)]">{lead.confidencePercent}%</dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--bt-muted)]">Projected sales date</dt>
              <dd className="text-sm text-[var(--bt-text)]">{lead.projectedSalesDate ? formatDate(lead.projectedSalesDate) : "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--bt-muted)]">Estimated revenue</dt>
              <dd className="text-sm text-[var(--bt-text)]">
                {lead.estimatedRevenueMinCents !== null || lead.estimatedRevenueMaxCents !== null
                  ? `${lead.estimatedRevenueMinCents !== null ? formatMoney(lead.estimatedRevenueMinCents) : "—"} to ${lead.estimatedRevenueMaxCents !== null ? formatMoney(lead.estimatedRevenueMaxCents) : "—"}`
                  : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--bt-muted)]">Project type</dt>
              <dd className="text-sm text-[var(--bt-text)]">{lead.projectType ?? "—"}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs text-[var(--bt-muted)]">Tags</dt>
              <dd className="text-sm text-[var(--bt-text)]">
                {lead.tags.length > 0 ? (
                  <span className="flex flex-wrap gap-1">
                    {lead.tags.map((tag) => (
                      <span key={tag} className="rounded-full bg-black/5 px-2 py-0.5 text-xs">
                        {tag}
                      </span>
                    ))}
                  </span>
                ) : (
                  "—"
                )}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs text-[var(--bt-muted)]">Notes</dt>
              <dd className="whitespace-pre-wrap text-sm text-[var(--bt-text)]">{lead.notes ?? "—"}</dd>
            </div>
          </dl>

          <LeadDetailsForm
            leadId={lead.id}
            title={lead.title}
            confidencePercent={lead.confidencePercent}
            projectedSalesDate={lead.projectedSalesDate}
            estimatedRevenueMinCents={lead.estimatedRevenueMinCents}
            estimatedRevenueMaxCents={lead.estimatedRevenueMaxCents}
            projectType={lead.projectType}
            tags={lead.tags}
          />
        </div>
      )}
    </div>
  );
}
