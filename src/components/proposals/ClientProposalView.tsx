/**
 * Client-facing proposal layout matching Handoff Preview:
 * centered brand + slogan + company address/phone, PROPOSAL title + address,
 * Prepared for/by/Date, Client Message, numbered scope sections with prices,
 * optional photo strip, Payment Schedule, Pricing summary (Subtotal/Tax/Total),
 * dual signatures, Terms.
 */

import type { ReactNode } from "react";

import { OutboundBrandMark } from "@/components/branding/OutboundBrandMark";
import { ProposalSignatureBlocks, type ProposalSignatureSide } from "@/components/proposals/ProposalSignatureBlocks";
import { ProposalTermsBlock } from "@/components/proposals/ProposalTermsBlock";
import { formatDate, formatMoney } from "@/lib/format";
import { formatCompanyAddress, resolveCompanySlogan } from "@/lib/organization/company-defaults";

export type ClientProposalOrg = {
  readonly name: string;
  readonly addressLine1: string | null;
  readonly city: string | null;
  readonly state: string | null;
  readonly postalCode: string | null;
  readonly contactEmail: string | null;
  readonly contactPhone: string | null;
  readonly slogan: string | null;
} | null;

export type ClientProposalClient = {
  readonly name: string;
  readonly email: string | null;
  readonly phone: string | null;
};

export type ClientProposalSection = {
  readonly id: string;
  readonly title: string;
  readonly bullets: readonly { readonly id: string; readonly text: string }[];
  /** Matched estimate group client total when available. */
  readonly priceCents?: number | null;
};

export type ClientProposalDraw = {
  readonly id: string;
  readonly title: string;
  readonly pctOfContractBasisPoints: number;
};

export type ClientProposalOption = {
  readonly id: string;
  readonly label: string;
  readonly totalCents: number;
};

export type ClientProposalPhoto = {
  readonly id: string;
  readonly fileName: string;
  readonly url: string;
};

export function ClientProposalView({
  title,
  projectAddress,
  client,
  organization,
  createdAt,
  coverMessage,
  sections,
  draws,
  options,
  accentColor,
  logoUrl,
  organizationLogoPath = null,
  termsText = null,
  photos = [],
  clientSignature,
  companySignature,
  mode = "preview",
  acceptSlot,
  feedbackSlot,
  clientSignCta,
  companySignCta,
}: {
  readonly title: string;
  readonly projectAddress: string | null;
  readonly client: ClientProposalClient;
  readonly organization: ClientProposalOrg;
  readonly createdAt: Date;
  readonly coverMessage: string | null;
  readonly sections: readonly ClientProposalSection[];
  readonly draws: readonly ClientProposalDraw[];
  readonly options: readonly ClientProposalOption[];
  readonly accentColor: string | null;
  readonly logoUrl: string | null;
  readonly organizationLogoPath?: string | null;
  readonly termsText?: string | null;
  readonly photos?: readonly ClientProposalPhoto[];
  readonly clientSignature?: ProposalSignatureSide | null;
  readonly companySignature?: ProposalSignatureSide | null;
  /** preview = staff/PDF; review = client link with accept/feedback slots. */
  readonly mode?: "preview" | "review" | "print";
  readonly acceptSlot?: ReactNode;
  readonly feedbackSlot?: ReactNode;
  readonly clientSignCta?: ReactNode;
  readonly companySignCta?: ReactNode;
}) {
  const accent = accentColor?.trim() || "var(--bt-primary, #1a5c3a)";
  const primaryTotal = options.length === 1 ? options[0].totalCents : null;
  const isPrint = mode === "print";
  const companyAddress = formatCompanyAddress(organization);
  const slogan = resolveCompanySlogan(organization?.slogan);
  const phone = organization?.contactPhone?.trim() || null;
  const orgName = organization?.name ?? "World Construction Inc";

  const clientSide: ProposalSignatureSide = clientSignature ?? { name: null, signedAt: null, hash: null };
  const companySide: ProposalSignatureSide = companySignature ?? { name: null, signedAt: null, hash: null };

  const subtotalCents =
    primaryTotal ??
    (options.length > 0 ? Math.min(...options.map((o) => o.totalCents)) : 0);
  const taxCents = 0;
  const totalCents = primaryTotal ?? subtotalCents + taxCents;

  return (
    <article
      className={`mx-auto w-full max-w-3xl bg-white text-[#1a1a1a] ${
        isPrint ? "px-0 py-0" : "rounded-lg border px-3 py-5 shadow-sm sm:px-10 sm:py-10"
      }`}
      style={isPrint ? undefined : { borderColor: "#e5e7eb" }}
    >
      <header className="flex flex-col items-center gap-1.5 text-center sm:gap-2">
        <OutboundBrandMark
          logoUrl={logoUrl}
          organizationLogoPath={organizationLogoPath}
          className="h-12 w-auto max-w-[12rem] object-contain sm:h-16 sm:max-w-[14rem]"
        />
        <div className="text-sm font-semibold tracking-tight text-[#1a1a1a] sm:text-base">{orgName}</div>
        <p className="max-w-md text-[11px] italic leading-snug text-[#6b7280] sm:text-sm">{slogan}</p>
        {(companyAddress || phone) && (
          <div className="mt-0.5 space-y-0.5 text-[10px] leading-relaxed text-[#6b7280] sm:text-xs">
            {companyAddress ? <div>{companyAddress}</div> : null}
            {phone ? (
              <div>
                <a href={`tel:${phone.replace(/[^\d+]/g, "")}`} className="hover:underline">
                  {phone}
                </a>
              </div>
            ) : null}
          </div>
        )}
      </header>

      <div className="mt-5 border-t border-[#e5e7eb] pt-4 text-center sm:mt-6 sm:pt-5 sm:text-left">
        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#9ca3af]">Proposal</div>
        <h1 className="mt-1 text-xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
        {projectAddress ? <p className="mt-1 text-sm text-[#6b7280]">{projectAddress}</p> : null}
      </div>

      <div className="mt-5 grid gap-4 border-t border-[#e5e7eb] pt-4 text-sm sm:mt-6 sm:grid-cols-3 sm:gap-5 sm:pt-5">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wide text-[#9ca3af]">Prepared for</div>
          <div className="mt-1 font-medium">{client.name}</div>
          {client.email ? (
            <a href={`mailto:${client.email}`} className="mt-0.5 block break-all text-xs text-[#6b7280] hover:underline">
              {client.email}
            </a>
          ) : null}
          {client.phone ? (
            <a href={`tel:${client.phone.replace(/[^\d+]/g, "")}`} className="block text-xs text-[#6b7280] hover:underline">
              {client.phone}
            </a>
          ) : null}
        </div>
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wide text-[#9ca3af]">Prepared by</div>
          <div className="mt-1 font-medium">{orgName}</div>
          {companyAddress ? <div className="text-xs text-[#6b7280]">{companyAddress}</div> : null}
          {phone ? <div className="text-xs text-[#6b7280]">{phone}</div> : null}
          {organization?.contactEmail ? (
            <a
              href={`mailto:${organization.contactEmail}`}
              className="block break-all text-xs text-[#6b7280] hover:underline"
            >
              {organization.contactEmail}
            </a>
          ) : null}
        </div>
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wide text-[#9ca3af]">Date</div>
          <div className="mt-1 font-medium">{formatDate(createdAt)}</div>
        </div>
      </div>

      <section className="mt-5 border-t border-[#e5e7eb] pt-4 sm:mt-6 sm:pt-5">
        <h2 className="text-sm font-semibold">Client Message</h2>
        {coverMessage ? (
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-[#374151]">{coverMessage}</p>
        ) : (
          <p className="mt-2 text-sm italic text-[#9ca3af]">No cover message yet.</p>
        )}
      </section>

      {photos.length > 0 ? (
        <section className="mt-5 border-t border-[#e5e7eb] pt-4 sm:mt-6 sm:pt-5 break-inside-avoid">
          <h2 className="text-sm font-semibold">Project photos</h2>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3">
            {photos.map((photo) => (
              <a
                key={photo.id}
                href={photo.url}
                target="_blank"
                rel="noreferrer"
                className="block aspect-[4/3] overflow-hidden rounded-md border border-[#e5e7eb] bg-[#f9fafb]"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- signed/short-lived URLs */}
                <img src={photo.url} alt={photo.fileName} className="h-full w-full object-cover" />
              </a>
            ))}
          </div>
        </section>
      ) : null}

      {sections.map((section, index) => (
        <section key={section.id} className="mt-5 border-t border-[#e5e7eb] pt-4 sm:mt-6 sm:pt-5 break-inside-avoid">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-sm font-semibold sm:text-[15px]">
              <span className="mr-1.5 tabular-nums text-[#9ca3af]">{index + 1}.</span>
              {section.title}
            </h2>
            {section.priceCents != null ? (
              <span className="shrink-0 text-sm font-semibold tabular-nums" style={{ color: accent }}>
                {formatMoney(section.priceCents)}
              </span>
            ) : null}
          </div>
          {section.bullets.length === 0 ? (
            <p className="mt-2 text-sm text-[#9ca3af]">No details in this section.</p>
          ) : (
            <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-[#374151]">
              {section.bullets.map((bullet) => (
                <li key={bullet.id}>{bullet.text}</li>
              ))}
            </ul>
          )}
        </section>
      ))}

      {draws.length > 0 ? (
        <section className="mt-5 rounded-lg border border-[#e5e7eb] bg-[#fafafa] p-3 sm:mt-6 sm:p-4 break-inside-avoid">
          <h2 className="text-sm font-semibold">Payment Schedule</h2>
          <ul className="mt-2 space-y-1.5 text-sm sm:mt-3 sm:space-y-2">
            {draws.map((draw) => {
              const amount =
                primaryTotal != null
                  ? Math.round((primaryTotal * draw.pctOfContractBasisPoints) / 10_000)
                  : null;
              return (
                <li
                  key={draw.id}
                  className="flex items-center justify-between gap-3 border-b border-dashed border-[#e5e7eb] py-1.5 last:border-0"
                >
                  <span>
                    {draw.title}{" "}
                    <span className="text-[#9ca3af]">({(draw.pctOfContractBasisPoints / 100).toFixed(0)}%)</span>
                  </span>
                  <span className="font-medium tabular-nums">
                    {amount != null ? formatMoney(amount) : `${(draw.pctOfContractBasisPoints / 100).toFixed(1)}%`}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <section className="mt-5 border-t border-[#e5e7eb] pt-4 sm:mt-6 sm:pt-5 break-inside-avoid">
        {options.length <= 1 ? (
          <>
            <h2 className="text-sm font-semibold">Pricing summary</h2>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-[#6b7280]">Subtotal</dt>
                <dd className="tabular-nums font-medium">{formatMoney(subtotalCents)}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-[#6b7280]">Tax</dt>
                <dd className="tabular-nums text-[#6b7280]">0.0%</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3 border-t border-[#e5e7eb] pt-2">
                <dt className="font-semibold">Total</dt>
                <dd className="text-2xl font-semibold tabular-nums sm:text-3xl" style={{ color: accent }}>
                  {formatMoney(totalCents)}
                </dd>
              </div>
            </dl>
            <p className="mt-3 text-sm leading-relaxed text-[#374151]">
              The total estimated investment for this project is{" "}
              <strong className="tabular-nums" style={{ color: accent }}>
                {formatMoney(totalCents)}
              </strong>
              .
            </p>
          </>
        ) : (
          <div>
            <h2 className="text-sm font-semibold">Choose your option</h2>
            <ul className="mt-3 space-y-2">
              {options.map((option) => (
                <li
                  key={option.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-[#e5e7eb] px-3 py-2.5"
                >
                  <span className="text-sm font-medium">{option.label}</span>
                  <span className="text-lg font-semibold tabular-nums" style={{ color: accent }}>
                    {formatMoney(option.totalCents)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <ProposalSignatureBlocks
        client={clientSide}
        company={companySide}
        companyLabel={orgName}
        clientCta={clientSignCta}
        companyCta={companySignCta}
      />

      {acceptSlot ? <section className="mt-6">{acceptSlot}</section> : null}
      {feedbackSlot ? <section className="mt-6">{feedbackSlot}</section> : null}

      {termsText ? <ProposalTermsBlock termsText={termsText} /> : null}

      <footer className="mt-8 border-t border-[#e5e7eb] pt-4 text-center text-[11px] leading-relaxed text-[#6b7280] sm:text-xs">
        <div className="font-medium text-[#374151]">{orgName}</div>
        <div className="italic">{slogan}</div>
        {companyAddress ? <div className="mt-1">{companyAddress}</div> : null}
        {phone ? <div>{phone}</div> : null}
      </footer>
    </article>
  );
}
