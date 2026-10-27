/**
 * Client-facing proposal layout matching Handoff Preview:
 * centered brand, PROPOSAL title + address, Prepared for/by/Date,
 * Client Message, scoped sections with optional group prices,
 * Payment Schedule with dollar amounts, Investment total, accept area.
 */

import type { ReactNode } from "react";

import { formatDate, formatMoney } from "@/lib/format";

export type ClientProposalOrg = {
  readonly name: string;
  readonly addressLine1: string | null;
  readonly city: string | null;
  readonly state: string | null;
  readonly postalCode: string | null;
  readonly contactEmail: string | null;
  readonly contactPhone: string | null;
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

function orgAddress(org: NonNullable<ClientProposalOrg>): string {
  return [org.addressLine1, org.city, org.state, org.postalCode].filter(Boolean).join(", ");
}

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
  mode = "preview",
  acceptSlot,
  feedbackSlot,
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
  /** preview = staff/PDF; review = client link with accept/feedback slots. */
  readonly mode?: "preview" | "review" | "print";
  readonly acceptSlot?: ReactNode;
  readonly feedbackSlot?: ReactNode;
}) {
  const accent = accentColor?.trim() || "var(--bt-primary, #1a5c3a)";
  const primaryTotal = options.length === 1 ? options[0].totalCents : null;
  const isPrint = mode === "print";

  return (
    <article
      className={`mx-auto w-full max-w-3xl bg-white text-[#1a1a1a] ${isPrint ? "px-0 py-0" : "rounded-lg border px-4 py-6 shadow-sm sm:px-10 sm:py-10"}`}
      style={isPrint ? undefined : { borderColor: "#e5e7eb" }}
    >
      <header className="flex flex-col items-center gap-2 text-center">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- branding URL may be external
          <img src={logoUrl} alt="" className="h-14 w-auto object-contain" />
        ) : (
          <div
            className="flex h-12 w-12 items-center justify-center rounded-full text-base font-bold text-white"
            style={{ background: accent }}
            aria-hidden
          >
            {(organization?.name ?? "W").charAt(0)}
          </div>
        )}
        <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[#6b7280]">
          {organization?.name ?? "Proposal"}
        </div>
      </header>

      <div className="mt-6 border-t border-[#e5e7eb] pt-5 text-center sm:text-left">
        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#9ca3af]">Proposal</div>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
        {projectAddress ? <p className="mt-1 text-sm text-[#6b7280]">{projectAddress}</p> : null}
      </div>

      <div className="mt-6 grid gap-5 border-t border-[#e5e7eb] pt-5 text-sm sm:grid-cols-3">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wide text-[#9ca3af]">Prepared for</div>
          <div className="mt-1 font-medium">{client.name}</div>
          {client.email ? <div className="break-all text-xs text-[#6b7280]">{client.email}</div> : null}
          {client.phone ? <div className="text-xs text-[#6b7280]">{client.phone}</div> : null}
        </div>
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wide text-[#9ca3af]">Prepared by</div>
          <div className="mt-1 font-medium">{organization?.name ?? "—"}</div>
          {organization && orgAddress(organization) ? (
            <div className="text-xs text-[#6b7280]">{orgAddress(organization)}</div>
          ) : null}
          {organization?.contactEmail ? <div className="break-all text-xs text-[#6b7280]">{organization.contactEmail}</div> : null}
          {organization?.contactPhone ? <div className="text-xs text-[#6b7280]">{organization.contactPhone}</div> : null}
        </div>
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wide text-[#9ca3af]">Date</div>
          <div className="mt-1 font-medium">{formatDate(createdAt)}</div>
        </div>
      </div>

      <section className="mt-6 border-t border-[#e5e7eb] pt-5">
        <h2 className="text-sm font-semibold">Client Message</h2>
        {coverMessage ? (
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-[#374151]">{coverMessage}</p>
        ) : (
          <p className="mt-2 text-sm italic text-[#9ca3af]">No cover message yet.</p>
        )}
      </section>

      {sections.map((section) => (
        <section key={section.id} className="mt-6 border-t border-[#e5e7eb] pt-5 break-inside-avoid">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-sm font-semibold">{section.title}</h2>
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

      {draws.length > 0 && primaryTotal != null ? (
        <section className="mt-6 border-t border-[#e5e7eb] pt-5 break-inside-avoid">
          <h2 className="text-sm font-semibold">Payment Schedule</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {draws.map((draw) => {
              const amount = Math.round((primaryTotal * draw.pctOfContractBasisPoints) / 10_000);
              return (
                <li
                  key={draw.id}
                  className="flex items-center justify-between gap-3 border-b border-dashed border-[#e5e7eb] py-2 last:border-0"
                >
                  <span>
                    {draw.title}{" "}
                    <span className="text-[#9ca3af]">({(draw.pctOfContractBasisPoints / 100).toFixed(0)}%)</span>
                  </span>
                  <span className="font-medium tabular-nums">{formatMoney(amount)}</span>
                </li>
              );
            })}
          </ul>
        </section>
      ) : draws.length > 0 ? (
        <section className="mt-6 border-t border-[#e5e7eb] pt-5">
          <h2 className="text-sm font-semibold">Payment Schedule</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {draws.map((draw) => (
              <li key={draw.id} className="flex items-center justify-between gap-3 py-1">
                <span>{draw.title}</span>
                <span className="tabular-nums text-[#6b7280]">{(draw.pctOfContractBasisPoints / 100).toFixed(1)}%</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="mt-6 border-t border-[#e5e7eb] pt-5 break-inside-avoid">
        {options.length <= 1 ? (
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-sm font-semibold">Investment</h2>
            <div className="text-2xl font-semibold tabular-nums" style={{ color: accent }}>
              {formatMoney(options[0]?.totalCents ?? 0)}
            </div>
          </div>
        ) : (
          <div>
            <h2 className="text-sm font-semibold">Choose your option</h2>
            <ul className="mt-3 space-y-2">
              {options.map((option) => (
                <li key={option.id} className="flex items-center justify-between gap-3 rounded-lg border border-[#e5e7eb] px-3 py-2.5">
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

      {acceptSlot ? <section className="mt-8">{acceptSlot}</section> : null}
      {feedbackSlot ? <section className="mt-6">{feedbackSlot}</section> : null}
    </article>
  );
}
