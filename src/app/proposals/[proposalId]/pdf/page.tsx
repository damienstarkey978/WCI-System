import { notFound } from "next/navigation";

import { SetupNotice } from "@/app/admin/setup-notice";
import { currentAppUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { resolveFileUrl } from "@/lib/files/service";
import { formatDate, formatMoney } from "@/lib/format";
import { estimateTotalCents } from "@/lib/budget/funnel";

import { PrintButton } from "./print-button";

export const dynamic = "force-dynamic";

/**
 * The exported-PDF side of the handoff.ai-style proposal builder — a client-facing
 * document generated from the same Proposal row the split-screen editor
 * (/leads/proposals/[proposalId]) edits, rendered as its own bare page (no app nav)
 * with a print stylesheet so "Print" -> "Save as PDF" produces the actual export.
 * Deliberately outside /leads so it doesn't inherit the staff shell's chrome.
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
        options: {
          orderBy: { sortOrder: "asc" },
          select: { id: true, label: true, estimate: { select: { lineItems: { select: { quantityMilli: true, unitCostCents: true, rateMode: true, rateBasisPoints: true } } } } },
        },
        sections: { orderBy: { sortOrder: "asc" }, include: { bullets: { orderBy: { sortOrder: "asc" } } } },
      },
    }),
    db.organization.findUnique({
      where: { id: user.organizationId },
      select: { name: true, logoPath: true, addressLine1: true, city: true, state: true, postalCode: true, contactEmail: true, contactPhone: true },
    }),
  ]);
  if (!proposal) notFound();

  // Files always belong to a real Job — a proposal still against a bare Lead
  // (no Job yet) can't have any pre-sale photos filed against it either.
  const preSalePhotoFiles = proposal.jobId
    ? await db.file.findMany({
        where: { jobId: proposal.jobId, category: "PRESALE_PHOTO" },
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

  const optionTotals = proposal.options.map((option) => ({ id: option.id, label: option.label, totalCents: estimateTotalCents(option.estimate.lineItems) }));

  const logoUrl = organization?.logoPath?.startsWith("http") ? organization.logoPath : null;
  const orgAddress = organization
    ? [organization.addressLine1, organization.city, organization.state, organization.postalCode].filter(Boolean).join(", ")
    : "";

  return (
    <div className="mx-auto max-w-3xl px-8 py-10 text-[#1a1a1a] print:px-0 print:py-0">
      <style>{`
        @media print {
          @page { margin: 0.75in; }
          .no-print { display: none !important; }
        }
      `}</style>

      <div className="no-print mb-6 flex justify-end">
        <PrintButton />
      </div>

      <header className="flex items-start justify-between gap-6 border-b-2 border-[#1a1a1a] pb-6">
        <div className="flex items-center gap-3">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- a print document, not a Next-optimized page
            <img src={logoUrl} alt={organization?.name ?? "Company logo"} className="h-14 w-auto" />
          ) : null}
          <div>
            <div className="text-lg font-bold">{organization?.name ?? "World Construction Inc"}</div>
            {orgAddress ? <div className="text-xs text-[#555]">{orgAddress}</div> : null}
            <div className="text-xs text-[#555]">
              {[organization?.contactEmail, organization?.contactPhone].filter(Boolean).join(" · ")}
            </div>
          </div>
        </div>
        <div className="text-right text-xs text-[#555]">
          <div className="text-sm font-semibold uppercase tracking-wide text-[#1a1a1a]">Proposal</div>
          <div>{formatDate(proposal.createdAt)}</div>
        </div>
      </header>

      <section className="mt-6 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">{proposal.title}</h1>
          <div className="mt-1 text-sm text-[#555]">
            Prepared for {proposal.client.name}
            {proposal.client.email ? ` · ${proposal.client.email}` : ""}
            {proposal.client.phone ? ` · ${proposal.client.phone}` : ""}
          </div>
        </div>
      </section>

      {proposal.coverMessage ? <p className="mt-6 whitespace-pre-wrap text-sm leading-relaxed">{proposal.coverMessage}</p> : null}

      {preSalePhotos.length > 0 ? (
        <section className="mt-8 break-inside-avoid">
          <h2 className="border-b border-[#ddd] pb-1 text-sm font-semibold uppercase tracking-wide text-[#1a1a1a]">Project Photos</h2>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {preSalePhotos.map((photo) =>
              photo.url ? (
                // eslint-disable-next-line @next/next/no-img-element -- a print document, not a Next-optimized page
                <img key={photo.id} src={photo.url} alt={photo.fileName} className="h-28 w-full rounded object-cover" />
              ) : null,
            )}
          </div>
        </section>
      ) : null}

      {proposal.sections.length > 0 ? (
        <section className="mt-8 flex flex-col gap-6">
          {proposal.sections.map((section) => (
            <div key={section.id} className="break-inside-avoid">
              <h2 className="border-b border-[#ddd] pb-1 text-sm font-semibold uppercase tracking-wide text-[#1a1a1a]">{section.title}</h2>
              <ul className="mt-2 list-disc pl-5 text-sm leading-relaxed">
                {section.bullets.map((bullet) => (
                  <li key={bullet.id}>{bullet.text}</li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      ) : null}

      {optionTotals.length === 1 ? (
        <section className="mt-10 flex items-center justify-between border-t-2 border-[#1a1a1a] pt-4">
          <span className="text-sm font-semibold uppercase tracking-wide">Total investment</span>
          <span className="text-xl font-bold">{formatMoney(optionTotals[0].totalCents)}</span>
        </section>
      ) : (
        <section className="mt-10 border-t-2 border-[#1a1a1a] pt-4">
          <span className="text-sm font-semibold uppercase tracking-wide">Choose your option</span>
          <div className="mt-2 flex flex-col gap-2">
            {optionTotals.map((option) => (
              <div key={option.id} className="flex items-center justify-between border-b border-[#ddd] pb-2">
                <span className="text-sm font-medium">{option.label}</span>
                <span className="text-lg font-bold">{formatMoney(option.totalCents)}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
