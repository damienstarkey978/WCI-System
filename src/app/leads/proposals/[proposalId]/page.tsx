import Link from "next/link";
import { notFound } from "next/navigation";

import { SetupNotice } from "@/app/admin/setup-notice";
import { CommentThread } from "@/components/comments/CommentThread";
import { estimateTotalCents, extendedCostCents, priceWithRate } from "@/lib/budget/funnel";
import { currentAppUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { resolveFileUrl } from "@/lib/files/service";
import { formatDate, formatMoney } from "@/lib/format";
import { MAX_PROPOSAL_OPTIONS } from "@/lib/proposals/service";

import { AddLineItemForm } from "./add-line-item-form";
import { AddSectionForm } from "./add-section-form";
import { BrandingForm } from "./branding-form";
import { CoverMessageEditor } from "./cover-message-editor";
import { EstimateLineItemRow } from "./estimate-line-item-row";
import { OptionTabs } from "./option-tabs";
import { ProposalSectionEditor } from "./proposal-section-editor";
import { ReviewLinkButton } from "./review-link-button";
import { declineProposalPageAction, sendProposalPageAction } from "./actions";

export const dynamic = "force-dynamic";

const STATUS_STYLE: Record<string, { bg: string; text: string }> = {
  DRAFT: { bg: "#e5e7eb", text: "#374151" },
  SENT: { bg: "color-mix(in srgb, var(--bt-primary) 14%, transparent)", text: "var(--bt-primary)" },
  ACCEPTED: { bg: "var(--bt-status-open-bg)", text: "var(--bt-status-open-text)" },
  DECLINED: { bg: "color-mix(in srgb, var(--bt-danger) 14%, transparent)", text: "var(--bt-danger)" },
};

/**
 * The handoff.ai-style split screen: the Estimate side (internal, cost-code-priced,
 * grouped by construction phase) next to the Proposal side (the client-facing
 * narrative that goes with it). They're generated together by Jarvis but stored and
 * edited independently (ProposalSection/Bullet are not FK-derived from line items),
 * same as the reference tool — editing either side only works while still DRAFT,
 * since a SENT proposal is what the client already has in front of them.
 */
export default async function ProposalEditorPage({ params, searchParams }: PageProps<"/leads/proposals/[proposalId]">) {
  const { proposalId } = await params;
  const { option: optionParam } = await searchParams;

  let user;
  try {
    user = await currentAppUser();
  } catch (error) {
    return <SetupNotice detail={error instanceof Error ? error.message : String(error)} />;
  }
  if (!user) {
    return <SetupNotice detail="No organization found. Seed the database, then reload." />;
  }

  const [proposal, organization, costCodes] = await Promise.all([
    db.proposal.findFirst({
      where: { id: proposalId, organizationId: user.organizationId },
      include: {
        client: { select: { name: true, email: true, phone: true } },
        lead: { select: { id: true, name: true } },
        options: {
          orderBy: { sortOrder: "asc" },
          include: { estimate: { include: { lineItems: { include: { costCode: true }, orderBy: { sortOrder: "asc" } } } } },
        },
        sections: { orderBy: { sortOrder: "asc" }, include: { bullets: { orderBy: { sortOrder: "asc" } } } },
      },
    }),
    db.organization.findUnique({
      where: { id: user.organizationId },
      select: { name: true, addressLine1: true, city: true, state: true, postalCode: true, contactEmail: true, contactPhone: true },
    }),
    db.costCode.findMany({
      where: { organizationId: user.organizationId, isActive: true },
      orderBy: { sortOrder: "asc" },
      select: { id: true, code: true, name: true },
    }),
  ]);
  if (!proposal) notFound();

  const preSalePhotoFiles = await db.file.findMany({
    where: { jobId: proposal.jobId, category: "PRESALE_PHOTO" },
    orderBy: { createdAt: "asc" },
    select: { id: true, fileName: true, url: true },
  });
  const preSalePhotos = await Promise.all(
    preSalePhotoFiles.map(async (photo) => ({
      id: photo.id,
      fileName: photo.fileName,
      url: await resolveFileUrl(photo.url).catch(() => null),
    })),
  );

  const editable = proposal.status === "DRAFT";
  const style = STATUS_STYLE[proposal.status] ?? STATUS_STYLE.DRAFT;

  const activeOption = proposal.options.find((option) => option.id === optionParam) ?? proposal.options[0];
  const activeEstimate = activeOption.estimate;

  const groups = new Map<string, typeof activeEstimate.lineItems>();
  for (const item of activeEstimate.lineItems) {
    const key = item.groupLabel ?? "Ungrouped";
    const existing = groups.get(key);
    if (existing) existing.push(item);
    else groups.set(key, [item]);
  }

  const optionTabs = proposal.options.map((option) => ({ id: option.id, label: option.label, totalCents: estimateTotalCents(option.estimate.lineItems) }));
  const activeTotalCents = optionTabs.find((tab) => tab.id === activeOption.id)?.totalCents ?? 0;
  const headerTotalLabel =
    optionTabs.length <= 1
      ? formatMoney(optionTabs[0]?.totalCents ?? 0)
      : proposal.selectedOptionId
        ? `${formatMoney(optionTabs.find((tab) => tab.id === proposal.selectedOptionId)?.totalCents ?? 0)} (${proposal.options.find((o) => o.id === proposal.selectedOptionId)?.label})`
        : `${formatMoney(Math.min(...optionTabs.map((t) => t.totalCents)))} – ${formatMoney(Math.max(...optionTabs.map((t) => t.totalCents)))}`;
  const aiGenerated = proposal.options.some((option) => option.estimate.aiGenerated);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 p-6">
      <div>
        <Link href={proposal.lead ? `/leads/${proposal.lead.id}?tab=proposals` : "/leads/proposals"} className="text-xs text-[var(--bt-muted)] hover:underline">
          ← Back to {proposal.lead ? proposal.lead.name : "proposals"}
        </Link>
      </div>

      <div className="rounded-lg border bg-[var(--bt-panel-bg)] p-4" style={{ borderColor: "var(--bt-border)" }}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold text-[var(--bt-text)]">{proposal.title}</h1>
              {aiGenerated ? (
                <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: "color-mix(in srgb, var(--bt-primary) 14%, transparent)", color: "var(--bt-primary)" }}>
                  Drafted by Jarvis
                </span>
              ) : null}
              <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: style.bg, color: style.text }}>
                {proposal.status}
              </span>
            </div>
            <div className="mt-1 text-sm text-[var(--bt-muted)]">
              {proposal.client.name} · {proposal.client.email}
              {proposal.client.phone ? ` · ${proposal.client.phone}` : ""}
            </div>
            <div className="mt-0.5 text-xs text-[var(--bt-muted)]">Created {formatDate(proposal.createdAt)}</div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <span className="text-lg font-semibold text-[var(--bt-text)]">{headerTotalLabel}</span>
            <div className="flex gap-2">
              <Link
                href={`/proposals/${proposal.id}/pdf`}
                target="_blank"
                className="rounded border px-3 py-1.5 text-xs font-medium text-[var(--bt-text)]"
                style={{ borderColor: "var(--bt-border)" }}
              >
                View as PDF
              </Link>
              {proposal.status === "DRAFT" ? (
                <form action={sendProposalPageAction}>
                  <input type="hidden" name="proposalId" value={proposal.id} />
                  <button type="submit" className="rounded px-3 py-1.5 text-xs font-semibold text-[var(--bt-on-primary)]" style={{ background: "var(--bt-primary)" }}>
                    Send to client
                  </button>
                </form>
              ) : null}
              {proposal.status === "SENT" ? (
                <form action={declineProposalPageAction}>
                  <input type="hidden" name="proposalId" value={proposal.id} />
                  <button type="submit" className="rounded border px-3 py-1.5 text-xs font-medium text-[var(--bt-muted)] hover:text-red-600" style={{ borderColor: "var(--bt-border)" }}>
                    Mark declined
                  </button>
                </form>
              ) : null}
            </div>
            {proposal.status === "SENT" ? <ReviewLinkButton proposalId={proposal.id} /> : null}
          </div>
        </div>
        {organization ? (
          <div className="mt-3 border-t pt-3 text-xs text-[var(--bt-muted)]" style={{ borderColor: "var(--bt-border)" }}>
            {organization.name}
            {[organization.addressLine1, organization.city, organization.state, organization.postalCode].filter(Boolean).length > 0
              ? ` · ${[organization.addressLine1, organization.city, organization.state, organization.postalCode].filter(Boolean).join(", ")}`
              : ""}
            {organization.contactEmail ? ` · ${organization.contactEmail}` : ""}
            {organization.contactPhone ? ` · ${organization.contactPhone}` : ""}
          </div>
        ) : null}
        {!editable ? (
          <p className="mt-3 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            This proposal has been sent — the estimate and proposal narrative below are locked from further edits.
          </p>
        ) : null}
        {proposal.clientFeedback ? (
          <div className="mt-3 rounded border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900">
            <span className="font-semibold">Client feedback</span> ({formatDate(proposal.clientFeedbackAt)}): {proposal.clientFeedback}
          </div>
        ) : null}
      </div>

      <div className="rounded-lg border bg-[var(--bt-panel-bg)] p-4" style={{ borderColor: "var(--bt-border)" }}>
        <OptionTabs
          proposalId={proposal.id}
          options={optionTabs}
          activeOptionId={activeOption.id}
          editable={editable}
          maxOptions={MAX_PROPOSAL_OPTIONS}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-3 rounded-lg border bg-[var(--bt-panel-bg)] p-4" style={{ borderColor: "var(--bt-border)" }}>
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[var(--bt-text)]">Estimate — {activeOption.label}</h2>
            <span className="text-sm font-semibold text-[var(--bt-text)]">{formatMoney(activeTotalCents)}</span>
          </div>
          <p className="text-xs text-[var(--bt-muted)]">Internal cost breakdown — never shown to the client.</p>

          {[...groups.entries()].map(([groupLabel, items]) => {
            const groupTotal = items.reduce((total, item) => {
              const cost = extendedCostCents(item.quantityMilli, item.unitCostCents);
              return total + priceWithRate(cost, item.rateMode, item.rateBasisPoints);
            }, 0);
            return (
              <div key={groupLabel} className="rounded border" style={{ borderColor: "var(--bt-border)" }}>
                <div className="flex items-center justify-between border-b px-3 py-2" style={{ borderColor: "var(--bt-border)" }}>
                  <span className="text-xs font-semibold uppercase tracking-wide text-[var(--bt-muted)]">{groupLabel}</span>
                  <span className="text-xs font-semibold text-[var(--bt-text)]">{formatMoney(groupTotal)}</span>
                </div>
                <table className="w-full text-left text-sm">
                  <tbody>
                    {items.map((item) => {
                      const cost = extendedCostCents(item.quantityMilli, item.unitCostCents);
                      const extendedCents = priceWithRate(cost, item.rateMode, item.rateBasisPoints);
                      return (
                        <EstimateLineItemRow
                          key={item.id}
                          proposalId={proposal.id}
                          estimateId={activeEstimate.id}
                          editable={editable}
                          item={{
                            id: item.id,
                            title: item.title,
                            groupLabel: item.groupLabel,
                            costCodeLabel: `${item.costCode.code} — ${item.costCode.name}`,
                            quantityMilli: item.quantityMilli,
                            unitCostCents: item.unitCostCents,
                            rateBasisPoints: item.rateBasisPoints,
                            extendedCents,
                            confidence: item.confidence,
                            priceSource: item.priceSource,
                          }}
                        />
                      );
                    })}
                  </tbody>
                </table>
                {editable ? (
                  <div className="px-3 pb-3">
                    <AddLineItemForm proposalId={proposal.id} estimateId={activeEstimate.id} costCodes={costCodes} defaultGroupLabel={groupLabel} />
                  </div>
                ) : null}
              </div>
            );
          })}

          {editable ? (
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-[var(--bt-muted)]">New group</div>
              <AddLineItemForm proposalId={proposal.id} estimateId={activeEstimate.id} costCodes={costCodes} />
            </div>
          ) : null}
        </div>

        <div className="flex flex-col gap-3 rounded-lg border bg-[var(--bt-panel-bg)] p-4" style={{ borderColor: "var(--bt-border)" }}>
          <h2 className="text-sm font-semibold text-[var(--bt-text)]">Proposal</h2>
          <p className="text-xs text-[var(--bt-muted)]">The client-facing narrative — plain language, no pricing detail.</p>

          {preSalePhotos.length > 0 ? (
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-[var(--bt-muted)]">Pre-Sale Photos</span>
                <Link href={`/jobs/${proposal.jobId}/files?category=PRESALE_PHOTO`} className="text-xs text-[var(--bt-primary)] hover:underline">
                  Manage in Files →
                </Link>
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

          {editable ? (
            <CoverMessageEditor proposalId={proposal.id} coverMessage={proposal.coverMessage ?? ""} />
          ) : proposal.coverMessage ? (
            <p className="whitespace-pre-wrap text-sm text-[var(--bt-text)]">{proposal.coverMessage}</p>
          ) : null}

          {proposal.sections.length === 0 ? (
            <p className="text-sm text-[var(--bt-muted)]">No sections yet.</p>
          ) : editable ? (
            proposal.sections.map((section) => <ProposalSectionEditor key={section.id} proposalId={proposal.id} section={section} />)
          ) : (
            proposal.sections.map((section) => (
              <div key={section.id}>
                <div className="text-sm font-semibold text-[var(--bt-text)]">{section.title}</div>
                <ul className="mt-1 list-disc pl-4 text-sm text-[var(--bt-muted)]">
                  {section.bullets.map((bullet) => (
                    <li key={bullet.id}>{bullet.text}</li>
                  ))}
                </ul>
              </div>
            ))
          )}

          {editable ? <AddSectionForm proposalId={proposal.id} /> : null}
        </div>
      </div>

      {editable ? (
        <div className="rounded-lg border bg-[var(--bt-panel-bg)] p-4" style={{ borderColor: "var(--bt-border)" }}>
          <h2 className="text-sm font-semibold text-[var(--bt-text)]">Branding</h2>
          <p className="mt-0.5 mb-3 text-xs text-[var(--bt-muted)]">Shown on the client review page and PDF export.</p>
          <BrandingForm proposalId={proposal.id} accentColor={proposal.accentColor ?? ""} logoUrl={proposal.logoUrl ?? ""} />
        </div>
      ) : null}

      <CommentThread
        organizationId={user.organizationId}
        featureType="Proposal"
        featureId={proposal.id}
        revalidate={`/leads/proposals/${proposal.id}`}
        title="Internal notes (staff only — never visible to the client)"
      />
    </div>
  );
}
