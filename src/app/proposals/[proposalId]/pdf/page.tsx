import { notFound } from "next/navigation";

import { SetupNotice } from "@/app/admin/setup-notice";
import { ClientProposalView } from "@/components/proposals/ClientProposalView";
import { currentAppUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { estimateTotalCents, extendedCostCents, priceWithRate } from "@/lib/budget/funnel";
import { formatQuantityGlance, resolveLineUnit } from "@/lib/estimates/units";
import { resolveFileUrl } from "@/lib/files/service";
import { resolveProposalTermsText } from "@/lib/organization/proposal-terms";

import { PrintButton } from "./print-button";

export const dynamic = "force-dynamic";

/**
 * Staff Preview / print-to-PDF of the client proposal — same Handoff-style
 * document chrome as /proposals/review/[token], without accept controls.
 */
export default async function ProposalPdfPage({ params }: PageProps<"/proposals/[proposalId]/pdf">) {
  const { proposalId } = await params;

  let user;
  try {
    user = await currentAppUser();
  } catch (error) {
    return <SetupNotice detail={error instanceof Error ? error.message : String(error)} />;
  }
  if (!user) {
    return <SetupNotice detail="No organization found. Seed the database, then reload." />;
  }

  const [proposal, organization] = await Promise.all([
    db.proposal.findFirst({
      where: { id: proposalId, organizationId: user.organizationId },
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
                    id: true,
                    title: true,
                    groupLabel: true,
                    quantityMilli: true,
                    unit: true,
                    costType: true,
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
  ]);
  if (!proposal) notFound();

  const preSalePhotoFiles = proposal.jobId
    ? await db.file.findMany({
        where: { jobId: proposal.jobId, category: "PRESALE_PHOTO", deletedAt: null },
        orderBy: { createdAt: "asc" },
        select: { id: true, fileName: true, url: true },
      })
    : [];
  const photos = (
    await Promise.all(
      preSalePhotoFiles.map(async (photo) => {
        const url = await resolveFileUrl(photo.url).catch(() => null);
        return url ? { id: photo.id, fileName: photo.fileName, url } : null;
      }),
    )
  ).filter((photo): photo is { id: string; fileName: string; url: string } => photo !== null);

  const optionTotals = proposal.options.map((option) => ({
    id: option.id,
    label: option.label,
    totalCents: estimateTotalCents(option.estimate.lineItems),
  }));

  const activeEstimate = proposal.options[0]?.estimate;
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

  const quantities = (activeEstimate?.lineItems ?? [])
    .filter((item) => item.quantityMilli > 0)
    .slice(0, 12)
    .map((item) => ({
      id: item.id,
      label: item.title,
      quantityLabel: formatQuantityGlance(item.quantityMilli, resolveLineUnit(item.unit, item.costType)),
    }));

  return (
    <div className="min-h-screen bg-[#f3f4f6] px-3 py-6 sm:px-6 sm:py-10 print:bg-white print:px-0 print:py-0">
      <style>{`
        @media print {
          @page { margin: 0.6in; }
          .no-print { display: none !important; }
        }
      `}</style>

      <div className="no-print mx-auto mb-4 flex max-w-3xl justify-end">
        <PrintButton />
      </div>

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
        options={optionTotals}
        accentColor={proposal.accentColor}
        logoUrl={proposal.logoUrl}
        organizationLogoPath={organization?.logoPath ?? null}
        photos={photos}
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
        mode="print"
      />
    </div>
  );
}
