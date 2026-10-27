import Link from "next/link";
import { notFound } from "next/navigation";

import { SetupNotice } from "@/app/admin/setup-notice";
import { CommentThread } from "@/components/comments/CommentThread";
import { EstimateHandyDock } from "@/components/estimates/EstimateHandyDock";
import { EstimateProposalToggle } from "@/components/estimates/EstimateProposalToggle";
import { EstimateSpreadsheet, type SpreadsheetGroup } from "@/components/estimates/EstimateSpreadsheet";
import { LeadEstimateWorkspaceNav } from "@/components/estimates/LeadEstimateWorkspaceNav";
import { ClientProposalView } from "@/components/proposals/ClientProposalView";
import { estimateTotalCents, extendedCostCents, priceWithRate } from "@/lib/budget/funnel";
import { currentAppUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { isAnthropicConfigured, isTransactionalEmailConfigured, isTransactionalSmsConfigured } from "@/lib/env";
import { buildHandyPricingTerms, buildHandyScopeGroups } from "@/lib/estimates/handy-scope";
import { formatQuantityGlance, resolveLineUnit } from "@/lib/estimates/units";
import { isJarvisUiEnabled } from "@/lib/feature-flags";
import { resolveFileUrl } from "@/lib/files/service";
import { formatDate, formatMoney } from "@/lib/format";
import { resolveProposalTermsText } from "@/lib/organization/proposal-terms";
import { MAX_PROPOSAL_OPTIONS } from "@/lib/proposals/service";

import { AddLineItemForm } from "./add-line-item-form";
import { AddSectionForm } from "./add-section-form";
import { BrandingForm } from "./branding-form";
import { ApplyTemplateForm } from "./apply-template-form";
import { CompanySignButton } from "./company-sign-button";
import { CoverMessageEditor } from "./cover-message-editor";
import { EstimateLineItemRow } from "./estimate-line-item-row";
import { OptionTabs } from "./option-tabs";
import { PaymentScheduleEditor } from "./payment-schedule-editor";
import { ProposalSectionEditor } from "./proposal-section-editor";
import { ReviewLinkButton } from "./review-link-button";
import { SendProposalButtons } from "./send-proposal-buttons";
import { declineProposalPageAction } from "./actions";

export const dynamic = "force-dynamic";

const STATUS_STYLE: Record<string, { bg: string; text: string }> = {
  DRAFT: { bg: "#e5e7eb", text: "#374151" },
  SENT: { bg: "color-mix(in srgb, var(--bt-primary) 14%, transparent)", text: "var(--bt-primary)" },
  ACCEPTED: { bg: "var(--bt-status-open-bg)", text: "var(--bt-status-open-text)" },
  DECLINED: { bg: "color-mix(in srgb, var(--bt-danger) 14%, transparent)", text: "var(--bt-danger)" },
};

/**
 * Handoff-style Estimate | Proposal toggle on one document.
 * Estimate view: spreadsheet + editable line items.
 * Proposal view: client document chrome + narrative editors.
 */
export default async function ProposalEditorPage({ params, searchParams }: PageProps<"/leads/proposals/[proposalId]">) {
  const { proposalId } = await params;
  const { option: optionParam, view: viewParam } = await searchParams;
  const view = viewParam === "estimate" ? "estimate" : "proposal";

  let user;
  try {
    user = await currentAppUser();
  } catch (error) {
    return <SetupNotice detail={error instanceof Error ? error.message : String(error)} />;
  }
  if (!user) {
    return <SetupNotice detail="No organization found. Seed the database, then reload." />;
  }

  const [proposal, organization, costCodes, templates] = await Promise.all([
    db.proposal.findFirst({
      where: { id: proposalId, organizationId: user.organizationId },
      include: {
        client: { select: { name: true, email: true, phone: true } },
        lead: {
          select: {
            id: true,
            name: true,
            title: true,
            notes: true,
            email: true,
            phone: true,
            addressLine1: true,
            city: true,
            state: true,
            postalCode: true,
            convertedJobId: true,
          },
        },
        options: {
          orderBy: { sortOrder: "asc" },
          include: { estimate: { include: { lineItems: { include: { costCode: true }, orderBy: { sortOrder: "asc" } } } } },
        },
        sections: { orderBy: { sortOrder: "asc" }, include: { bullets: { orderBy: { sortOrder: "asc" } } } },
        draws: { orderBy: { sortOrder: "asc" } },
      },
    }),
    db.organization.findUnique({
      where: { id: user.organizationId },
      select: {
        name: true,
        logoPath: true,
        addressLine1: true,
        city: true,
        state: true,
        postalCode: true,
        contactEmail: true,
        contactPhone: true,
        slogan: true,
        defaultProposalTerms: true,
      },
    }),
    db.costCode.findMany({
      where: { organizationId: user.organizationId, isActive: true },
      orderBy: { sortOrder: "asc" },
      select: { id: true, code: true, name: true },
    }),
    db.proposalTemplate.findMany({ where: { organizationId: user.organizationId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  if (!proposal) notFound();

  const preSalePhotoFiles = proposal.jobId
    ? await db.file.findMany({
        where: { jobId: proposal.jobId, category: "PRESALE_PHOTO", deletedAt: null },
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

  const spreadsheetGroups: SpreadsheetGroup[] = [...groups.entries()].map(([label, items]) => {
    const mapped = items.map((item) => {
      const builderCostCents = extendedCostCents(item.quantityMilli, item.unitCostCents);
      const clientTotalCents = priceWithRate(builderCostCents, item.rateMode, item.rateBasisPoints);
      return {
        id: item.id,
        title: item.title,
        description: item.description,
        costCodeLabel: `${item.costCode.code} · ${item.costCode.name}`,
        costType: item.costType,
        quantityMilli: item.quantityMilli,
        unit: item.unit,
        unitCostCents: item.unitCostCents,
        rateMode: item.rateMode,
        rateBasisPoints: item.rateBasisPoints,
        builderCostCents,
        clientTotalCents,
      };
    });
    return {
      label,
      items: mapped,
      groupClientTotalCents: mapped.reduce((sum, row) => sum + row.clientTotalCents, 0),
    };
  });
  const totalBuilderCostCents = spreadsheetGroups.reduce(
    (sum, group) => sum + group.items.reduce((s, row) => s + row.builderCostCents, 0),
    0,
  );

  const optionTabs = proposal.options.map((option) => ({ id: option.id, label: option.label, totalCents: estimateTotalCents(option.estimate.lineItems) }));
  const activeTotalCents = optionTabs.find((tab) => tab.id === activeOption.id)?.totalCents ?? 0;
  const headerTotalLabel =
    optionTabs.length <= 1
      ? formatMoney(optionTabs[0]?.totalCents ?? 0)
      : proposal.selectedOptionId
        ? `${formatMoney(optionTabs.find((tab) => tab.id === proposal.selectedOptionId)?.totalCents ?? 0)} (${proposal.options.find((o) => o.id === proposal.selectedOptionId)?.label})`
        : `${formatMoney(Math.min(...optionTabs.map((t) => t.totalCents)))} – ${formatMoney(Math.max(...optionTabs.map((t) => t.totalCents)))}`;
  const aiGenerated = proposal.options.some((option) => option.estimate.aiGenerated);

  const estimateToggleHref = activeEstimate
    ? `/leads/estimates/${activeEstimate.id}`
    : `/leads/proposals/${proposal.id}?view=estimate${optionParam ? `&option=${encodeURIComponent(String(optionParam))}` : ""}`;

  const leadAddress = proposal.lead
    ? [proposal.lead.addressLine1, proposal.lead.city, proposal.lead.state, proposal.lead.postalCode].filter(Boolean).join(", ") || null
    : null;

  const groupPriceByLabel = new Map<string, number>();
  for (const [label, items] of groups.entries()) {
    const total = items.reduce((sum, item) => {
      const cost = extendedCostCents(item.quantityMilli, item.unitCostCents);
      return sum + priceWithRate(cost, item.rateMode, item.rateBasisPoints);
    }, 0);
    groupPriceByLabel.set(label.toLowerCase(), total);
  }

  const clientEmail = proposal.client.email?.trim() || proposal.lead?.email?.trim() || null;
  const clientPhone = proposal.client.phone?.trim() || proposal.lead?.phone?.trim() || null;
  const emailConfigured = isTransactionalEmailConfigured();
  const smsConfigured = isTransactionalSmsConfigured();

  const clientPhotos = preSalePhotos.filter(
    (photo): photo is { id: string; fileName: string; url: string } => Boolean(photo.url),
  );

  const quantities = activeEstimate.lineItems
    .filter((item) => item.quantityMilli > 0)
    .slice(0, 12)
    .map((item) => ({
      id: item.id,
      label: item.title,
      quantityLabel: formatQuantityGlance(item.quantityMilli, resolveLineUnit(item.unit, item.costType)),
    }));

  const scopeGroups = buildHandyScopeGroups(spreadsheetGroups);
  const pricingTerms = buildHandyPricingTerms({
    groups: spreadsheetGroups,
    totalClientCents: activeTotalCents,
    totalBuilderCostCents,
    lineItemCount: activeEstimate.lineItems.length,
  });

  const siblingEstimates = proposal.lead
    ? await db.estimate.findMany({
        where: {
          organizationId: user.organizationId,
          OR: [
            { leadId: proposal.lead.id },
            ...(proposal.lead.convertedJobId ? [{ jobId: proposal.lead.convertedJobId }] : []),
          ],
        },
        orderBy: { createdAt: "desc" },
        include: {
          lineItems: {
            select: { quantityMilli: true, unitCostCents: true, rateMode: true, rateBasisPoints: true },
          },
          proposalOptions: { select: { proposalId: true }, take: 1 },
        },
      })
    : [];
  const navEstimates = siblingEstimates.map((row) => ({
    id: row.id,
    title: row.title,
    totalLabel: formatMoney(estimateTotalCents(row.lineItems)),
    status: row.status,
    proposalId: row.proposalOptions[0]?.proposalId ?? null,
    active: row.id === activeEstimate.id,
  }));

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] flex-col gap-3 p-2 pb-20 sm:p-3 sm:pb-6 lg:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <Link
          href={proposal.lead ? `/leads/${proposal.lead.id}?tab=proposals&compose=1` : "/leads/proposals"}
          className="text-xs text-[var(--bt-muted)] hover:underline lg:hidden"
        >
          ← Back to {proposal.lead ? proposal.lead.name : "proposals"}
        </Link>
        <p className="text-[10px] font-medium uppercase tracking-wide text-[var(--bt-muted)]">
          Proposal workspace · Jarvis docked right
        </p>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 lg:flex-row lg:items-start">
        {proposal.lead ? (
          <LeadEstimateWorkspaceNav
            leadId={proposal.lead.id}
            leadName={proposal.lead.name}
            leadTitle={proposal.lead.title}
            estimates={navEstimates}
            activeKind="proposal"
          />
        ) : null}

        <div className="flex min-w-0 flex-1 flex-col gap-3">
      <div
        className="sticky top-0 z-20 border-b px-3 py-2.5 backdrop-blur-md sm:rounded-lg sm:border sm:px-4 sm:py-3"
        style={{
          borderColor: "var(--bt-border)",
          background: "color-mix(in srgb, var(--bt-panel-bg) 92%, transparent)",
        }}
      >
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg font-semibold text-[var(--bt-text)] sm:text-2xl">{proposal.title}</h1>
              {aiGenerated ? (
                <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: "color-mix(in srgb, var(--bt-primary) 14%, transparent)", color: "var(--bt-primary)" }}>
                  Drafted by Jarvis
                </span>
              ) : null}
              <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: style.bg, color: style.text }}>
                {proposal.status}
              </span>
            </div>
            <div className="mt-0.5 text-xs text-[var(--bt-muted)] sm:text-sm">
              {proposal.client.name}
              {proposal.client.email ? ` · ${proposal.client.email}` : ""}
              {proposal.client.phone ? ` · ${proposal.client.phone}` : ""}
            </div>
            <div className="mt-0.5 text-[11px] text-[var(--bt-muted)]">Created {formatDate(proposal.createdAt)}</div>
          </div>

          <div className="flex flex-col gap-2 sm:items-end">
            <EstimateProposalToggle
              active={view}
              estimateHref={estimateToggleHref}
              proposalHref={`/leads/proposals/${proposal.id}?view=proposal${optionParam ? `&option=${encodeURIComponent(String(optionParam))}` : ""}`}
            />
            <div className="flex flex-wrap items-center gap-2 sm:justify-end">
              <span className="text-base font-semibold tabular-nums text-[var(--bt-text)] sm:text-lg">{headerTotalLabel}</span>
              <Link
                href={`/proposals/${proposal.id}/pdf`}
                target="_blank"
                className="inline-flex min-h-10 touch-manipulation items-center gap-1.5 rounded-md border px-3 py-2 text-xs font-medium text-[var(--bt-text)] sm:min-h-0 sm:py-1.5"
                style={{ borderColor: "var(--bt-border)", background: "var(--bt-panel-bg)" }}
              >
                Preview
              </Link>
              {proposal.status === "SENT" ? (
                <form action={declineProposalPageAction}>
                  <input type="hidden" name="proposalId" value={proposal.id} />
                  <button type="submit" className="rounded-md border px-3 py-1.5 text-xs font-medium text-[var(--bt-muted)] hover:text-red-600" style={{ borderColor: "var(--bt-border)" }}>
                    Mark declined
                  </button>
                </form>
              ) : null}
            </div>
            <SendProposalButtons
              proposalId={proposal.id}
              clientEmail={clientEmail}
              clientPhone={clientPhone}
              emailConfigured={emailConfigured}
              smsConfigured={smsConfigured}
            />
            {proposal.status === "SENT" ? <ReviewLinkButton proposalId={proposal.id} /> : null}
          </div>
        </div>
      </div>

      {!editable ? (
        <p className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          This proposal has been sent — the estimate and proposal narrative below are locked from further edits.
        </p>
      ) : null}
      {proposal.clientFeedback ? (
        <div className="rounded border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900">
          <span className="font-semibold">Client feedback</span> ({formatDate(proposal.clientFeedbackAt)}): {proposal.clientFeedback}
        </div>
      ) : null}

      <div className="rounded-lg border bg-[var(--bt-panel-bg)] p-3 sm:p-4" style={{ borderColor: "var(--bt-border)" }}>
        <OptionTabs
          proposalId={proposal.id}
          options={optionTabs}
          activeOptionId={activeOption.id}
          editable={editable}
          maxOptions={MAX_PROPOSAL_OPTIONS}
        />
      </div>

      {view === "estimate" ? (
        <div className="flex flex-col gap-4">
          <EstimateSpreadsheet
            groups={spreadsheetGroups}
            totalBuilderCostCents={totalBuilderCostCents}
            totalClientCents={activeTotalCents}
            estimateId={activeEstimate.id}
            proposalId={proposal.id}
            reorderable={editable}
          />
          {editable ? (
            <div className="rounded-lg border bg-[var(--bt-panel-bg)] p-4" style={{ borderColor: "var(--bt-border)" }}>
              <h2 className="text-sm font-semibold text-[var(--bt-text)]">Edit line items</h2>
              <p className="mt-0.5 mb-3 text-xs text-[var(--bt-muted)]">
                Same cost-coded lines as the spreadsheet. Changes stay on the linked estimate.
              </p>
              {[...groups.entries()].map(([groupLabel, items]) => (
                <div key={groupLabel} className="mb-3 rounded border" style={{ borderColor: "var(--bt-border)" }}>
                  <div className="border-b px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--bt-muted)]" style={{ borderColor: "var(--bt-border)" }}>
                    {groupLabel}
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
                  <div className="px-3 pb-3">
                    <AddLineItemForm proposalId={proposal.id} estimateId={activeEstimate.id} costCodes={costCodes} defaultGroupLabel={groupLabel} />
                  </div>
                </div>
              ))}
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-[var(--bt-muted)]">New group</div>
                <AddLineItemForm proposalId={proposal.id} estimateId={activeEstimate.id} costCodes={costCodes} />
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="rounded-xl p-1 sm:p-6" style={{ background: "var(--bt-panel-bg-muted)" }}>
            <ClientProposalView
              title={proposal.title}
              projectAddress={leadAddress}
              client={proposal.client}
              organization={organization}
              createdAt={proposal.createdAt}
              coverMessage={proposal.coverMessage}
              sections={proposal.sections.map((section) => ({
                id: section.id,
                title: section.title,
                bullets: section.bullets,
                priceCents: groupPriceByLabel.get(section.title.toLowerCase()) ?? null,
              }))}
              draws={proposal.draws}
              options={optionTabs}
              accentColor={proposal.accentColor}
              logoUrl={proposal.logoUrl}
              organizationLogoPath={organization?.logoPath ?? null}
              photos={clientPhotos}
              quantities={quantities}
              termsText={resolveProposalTermsText({
                proposalTerms: proposal.termsText,
                organizationTerms: organization?.defaultProposalTerms,
              })}
              clientSignature={{
                name: proposal.clientSignatureName,
                signedAt: proposal.clientSignedAt,
                hash: proposal.clientSignatureHash,
              }}
              companySignature={{
                name: proposal.companySignatureName,
                signedAt: proposal.companySignedAt,
                hash: proposal.companySignatureHash,
              }}
              companySignCta={
                proposal.status === "DRAFT" || proposal.status === "SENT" ? (
                  <CompanySignButton
                    proposalId={proposal.id}
                    defaultName={user.name ?? user.email}
                    alreadySigned={Boolean(proposal.companySignedAt)}
                  />
                ) : undefined
              }
              mode="preview"
            />
          </div>

          {editable ? (
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="flex flex-col gap-3 rounded-lg border bg-[var(--bt-panel-bg)] p-4" style={{ borderColor: "var(--bt-border)" }}>
                <h2 className="text-sm font-semibold text-[var(--bt-text)]">Edit proposal narrative</h2>
                <p className="text-xs text-[var(--bt-muted)]">Client-facing copy. Pricing lives on the Estimate tab.</p>

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

                {templates.length > 0 ? <ApplyTemplateForm proposalId={proposal.id} templates={templates} /> : null}
                <CoverMessageEditor proposalId={proposal.id} coverMessage={proposal.coverMessage ?? ""} />
                {proposal.sections.length === 0 ? (
                  <p className="text-sm text-[var(--bt-muted)]">No sections yet.</p>
                ) : (
                  proposal.sections.map((section) => <ProposalSectionEditor key={section.id} proposalId={proposal.id} section={section} />)
                )}
                <AddSectionForm proposalId={proposal.id} />
              </div>

              <div className="flex flex-col gap-4">
                <div className="rounded-lg border bg-[var(--bt-panel-bg)] p-4" style={{ borderColor: "var(--bt-border)" }}>
                  <PaymentScheduleEditor proposalId={proposal.id} draws={proposal.draws} editable={editable} />
                </div>
                <div className="rounded-lg border bg-[var(--bt-panel-bg)] p-4" style={{ borderColor: "var(--bt-border)" }}>
                  <h2 className="text-sm font-semibold text-[var(--bt-text)]">Branding</h2>
                  <p className="mt-0.5 mb-3 text-xs text-[var(--bt-muted)]">Shown on the client review page and PDF export.</p>
                  <BrandingForm proposalId={proposal.id} accentColor={proposal.accentColor ?? ""} logoUrl={proposal.logoUrl ?? ""} />
                </div>
              </div>
            </div>
          ) : (
            <>
              {proposal.draws.length > 0 ? (
                <div className="rounded-lg border bg-[var(--bt-panel-bg)] p-4" style={{ borderColor: "var(--bt-border)" }}>
                  <PaymentScheduleEditor proposalId={proposal.id} draws={proposal.draws} editable={false} />
                </div>
              ) : null}
            </>
          )}
        </div>
      )}

      <CommentThread
        organizationId={user.organizationId}
        featureType="Proposal"
        featureId={proposal.id}
        revalidate={`/leads/proposals/${proposal.id}`}
        title="Internal notes (staff only — never visible to the client)"
      />
        </div>

        {proposal.lead ? (
          <EstimateHandyDock
            leadId={proposal.lead.id}
            leadName={proposal.lead.name}
            estimateId={activeEstimate.id}
            proposalId={proposal.id}
            estimateTitle={proposal.title}
            jarvisUiEnabled={isJarvisUiEnabled()}
            anthropicConfigured={isAnthropicConfigured()}
            scopeNotes={proposal.lead.notes}
            scopeGroups={scopeGroups}
            pricingTerms={pricingTerms}
          />
        ) : null}
      </div>
    </div>
  );
}
