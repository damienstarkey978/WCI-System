import { ClientActionTokenPurpose } from "@/generated/prisma/enums";
import { ClientProposalView } from "@/components/proposals/ClientProposalView";
import { estimateTotalCents, extendedCostCents, priceWithRate } from "@/lib/budget/funnel";
import { InvalidActionTokenError, peekActionToken } from "@/lib/client-portal/auth";
import { db } from "@/lib/db";
import { formatDate, formatMoney } from "@/lib/format";

import { AcceptOptionForm } from "./accept-option-form";
import { FeedbackForm } from "./feedback-form";

export const dynamic = "force-dynamic";

const DEFAULT_ACCENT = "#1a5c3a";

/**
 * Public, no-login proposal review page — Handoff-style client document with
 * accept / feedback. Token is peeked (not consumed) on load; only accept uses it.
 */
export default async function ProposalReviewPage({ params }: PageProps<"/proposals/review/[token]">) {
  const { token } = await params;

  let resolved: { clientId: string; proposalId: string } | null = null;
  let invalidMessage: string | null = null;
  try {
    const { clientId, resourceId } = await peekActionToken(token, ClientActionTokenPurpose.PROPOSAL_ACCEPTANCE, undefined, { allowUsed: true });
    if (!resourceId) throw new InvalidActionTokenError();
    resolved = { clientId, proposalId: resourceId };
  } catch (error) {
    if (error instanceof InvalidActionTokenError) {
      invalidMessage = error.message;
    } else {
      throw error;
    }
  }

  if (!resolved) {
    return (
      <div className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-2 bg-[#f3f4f6] p-6 text-center">
        <h1 className="text-lg font-semibold text-[#1a1a1a]">Link no longer valid</h1>
        <p className="text-sm text-[#555]">{invalidMessage}</p>
      </div>
    );
  }

  const proposal = await db.proposal.findUnique({
    where: { id: resolved.proposalId },
    include: {
      client: { select: { name: true, email: true, phone: true } },
      lead: { select: { addressLine1: true, city: true, state: true, postalCode: true } },
      options: {
        orderBy: { sortOrder: "asc" },
        include: {
          estimate: {
            include: {
              lineItems: {
                select: {
                  groupLabel: true,
                  quantityMilli: true,
                  unitCostCents: true,
                  rateMode: true,
                  rateBasisPoints: true,
                },
              },
            },
          },
        },
      },
      sections: { orderBy: { sortOrder: "asc" }, include: { bullets: { orderBy: { sortOrder: "asc" } } } },
      draws: { orderBy: { sortOrder: "asc" } },
    },
  });
  if (!proposal || proposal.clientId !== resolved.clientId) {
    return (
      <div className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-2 bg-[#f3f4f6] p-6 text-center">
        <h1 className="text-lg font-semibold text-[#1a1a1a]">Link no longer valid</h1>
        <p className="text-sm text-[#555]">This link is invalid, expired, or has already been used.</p>
      </div>
    );
  }

  const organization = await db.organization.findUnique({
    where: { id: proposal.organizationId },
    select: { name: true, addressLine1: true, city: true, state: true, postalCode: true, contactEmail: true, contactPhone: true },
  });

  const accentColor = proposal.accentColor ?? DEFAULT_ACCENT;
  const options = proposal.options.map((option) => ({
    id: option.id,
    label: option.label,
    totalCents: estimateTotalCents(option.estimate.lineItems),
  }));

  const activeEstimate = proposal.options.find((o) => o.id === proposal.selectedOptionId)?.estimate ?? proposal.options[0]?.estimate;
  const groupPriceByLabel = new Map<string, number>();
  if (activeEstimate) {
    for (const item of activeEstimate.lineItems) {
      const key = (item.groupLabel ?? "Ungrouped").toLowerCase();
      const cost = extendedCostCents(item.quantityMilli, item.unitCostCents);
      const price = priceWithRate(cost, item.rateMode, item.rateBasisPoints);
      groupPriceByLabel.set(key, (groupPriceByLabel.get(key) ?? 0) + price);
    }
  }

  const projectAddress = proposal.lead
    ? [proposal.lead.addressLine1, proposal.lead.city, proposal.lead.state, proposal.lead.postalCode].filter(Boolean).join(", ") || null
    : null;

  const acceptSlot =
    proposal.status === "ACCEPTED" ? (
      <div className="rounded-lg border-2 p-4 text-center" style={{ borderColor: accentColor }}>
        <p className="text-sm font-semibold" style={{ color: accentColor }}>
          You accepted this proposal
          {proposal.selectedOptionId ? ` — ${options.find((o) => o.id === proposal.selectedOptionId)?.label}` : ""} on{" "}
          {formatDate(proposal.clientSignedAt)}.
        </p>
      </div>
    ) : proposal.status === "DECLINED" ? (
      <div className="rounded-lg border border-[#e5e7eb] p-4 text-center text-sm text-[#555]">This proposal was declined.</div>
    ) : proposal.status === "SENT" ? (
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[#6b7280]">
          {options.length > 1 ? "Choose your option" : "Accept this proposal"}
        </h2>
        <div className={`mt-3 grid gap-3 ${options.length > 1 ? "sm:grid-cols-2" : ""}`}>
          {options.map((option) => (
            <div
              key={option.id}
              className="flex flex-col gap-3 rounded-lg border-2 p-4"
              style={{ borderColor: options.length > 1 ? "#e5e7eb" : accentColor }}
            >
              <div>
                <div className="text-sm font-semibold">{option.label}</div>
                <div className="text-2xl font-bold tabular-nums" style={{ color: accentColor }}>
                  {formatMoney(option.totalCents)}
                </div>
              </div>
              <AcceptOptionForm token={token} optionId={option.id} accentColor={accentColor} />
            </div>
          ))}
        </div>
      </div>
    ) : (
      <div className="rounded-lg border border-[#e5e7eb] p-4 text-center text-sm text-[#555]">This proposal isn&apos;t ready for review yet.</div>
    );

  const feedbackSlot =
    proposal.status === "SENT" ? (
      <div className="rounded-lg border border-[#e5e7eb] p-4">
        <h2 className="text-sm font-semibold text-[#1a1a1a]">Have a question first?</h2>
        <p className="mt-1 mb-2 text-xs text-[#555]">
          Leave a note and we&apos;ll follow up — this doesn&apos;t use up your link, so you can still come back and accept.
        </p>
        <FeedbackForm token={token} accentColor={accentColor} />
      </div>
    ) : null;

  return (
    <div className="min-h-screen bg-[#f3f4f6] px-3 py-6 sm:px-6 sm:py-10">
      <ClientProposalView
        title={proposal.title}
        projectAddress={projectAddress}
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
        options={options}
        accentColor={accentColor}
        logoUrl={proposal.logoUrl}
        mode="review"
        acceptSlot={acceptSlot}
        feedbackSlot={feedbackSlot}
      />
    </div>
  );
}
