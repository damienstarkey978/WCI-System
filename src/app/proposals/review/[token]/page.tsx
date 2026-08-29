import { ClientActionTokenPurpose } from "@/generated/prisma/enums";
import { estimateTotalCents } from "@/lib/budget/funnel";
import { InvalidActionTokenError, peekActionToken } from "@/lib/client-portal/auth";
import { db } from "@/lib/db";
import { formatDate, formatMoney } from "@/lib/format";

import { AcceptOptionForm } from "./accept-option-form";
import { FeedbackForm } from "./feedback-form";

export const dynamic = "force-dynamic";

const DEFAULT_ACCENT = "#0f4c81";

/**
 * Public, no-login proposal review page — the client-facing side of task #116's
 * multi-option support. Same headless-link pattern as the survey response page
 * (src/app/surveys/respond/[token]/page.tsx): the token in the URL is the only
 * credential, resolved with peekActionToken so loading the page never consumes
 * the single-use PROPOSAL_ACCEPTANCE link — only actually accepting does.
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
      <div className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-2 p-6 text-center">
        <h1 className="text-lg font-semibold text-[#1a1a1a]">Link no longer valid</h1>
        <p className="text-sm text-[#555]">{invalidMessage}</p>
      </div>
    );
  }

  const proposal = await db.proposal.findUnique({
    where: { id: resolved.proposalId },
    include: {
      client: { select: { name: true } },
      options: { orderBy: { sortOrder: "asc" }, include: { estimate: { include: { lineItems: true } } } },
      sections: { orderBy: { sortOrder: "asc" }, include: { bullets: { orderBy: { sortOrder: "asc" } } } },
    },
  });
  if (!proposal || proposal.clientId !== resolved.clientId) {
    return (
      <div className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-2 p-6 text-center">
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
  const options = proposal.options.map((option) => ({ id: option.id, label: option.label, totalCents: estimateTotalCents(option.estimate.lineItems) }));
  const orgAddress = organization
    ? [organization.addressLine1, organization.city, organization.state, organization.postalCode].filter(Boolean).join(", ")
    : "";

  return (
    <div className="mx-auto max-w-4xl px-6 py-10 text-[#1a1a1a]">
      <header className="flex items-center gap-3 border-b-2 pb-6" style={{ borderColor: accentColor }}>
        {proposal.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- an external client-supplied logo URL
          <img src={proposal.logoUrl} alt={organization?.name ?? "Company logo"} className="h-14 w-auto" />
        ) : null}
        <div>
          <div className="text-lg font-bold">{organization?.name ?? "Proposal"}</div>
          {orgAddress ? <div className="text-xs text-[#555]">{orgAddress}</div> : null}
          <div className="text-xs text-[#555]">{[organization?.contactEmail, organization?.contactPhone].filter(Boolean).join(" · ")}</div>
        </div>
      </header>

      <section className="mt-6">
        <h1 className="text-2xl font-bold">{proposal.title}</h1>
        <p className="mt-1 text-sm text-[#555]">Prepared for {proposal.client.name}</p>
        {proposal.coverMessage ? <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed">{proposal.coverMessage}</p> : null}
      </section>

      {proposal.sections.length > 0 ? (
        <section className="mt-8 flex flex-col gap-6">
          {proposal.sections.map((section) => (
            <div key={section.id}>
              <h2 className="border-b pb-1 text-sm font-semibold uppercase tracking-wide" style={{ borderColor: "#ddd" }}>
                {section.title}
              </h2>
              <ul className="mt-2 list-disc pl-5 text-sm leading-relaxed">
                {section.bullets.map((bullet) => (
                  <li key={bullet.id}>{bullet.text}</li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      ) : null}

      {proposal.status === "ACCEPTED" ? (
        <section className="mt-10 rounded-lg border-2 p-4 text-center" style={{ borderColor: accentColor }}>
          <p className="text-sm font-semibold" style={{ color: accentColor }}>
            You accepted this proposal
            {proposal.selectedOptionId ? ` — ${options.find((o) => o.id === proposal.selectedOptionId)?.label}` : ""} on{" "}
            {formatDate(proposal.clientSignedAt)}.
          </p>
        </section>
      ) : proposal.status === "DECLINED" ? (
        <section className="mt-10 rounded-lg border p-4 text-center text-sm text-[#555]">This proposal was declined.</section>
      ) : proposal.status === "SENT" ? (
        <>
          <section className="mt-10">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-[#555]">
              {options.length > 1 ? "Choose your option" : "Your investment"}
            </h2>
            <div className={`mt-3 grid gap-4 ${options.length > 1 ? "sm:grid-cols-2 lg:grid-cols-3" : ""}`}>
              {options.map((option) => (
                <div key={option.id} className="flex flex-col gap-3 rounded-lg border-2 p-4" style={{ borderColor: options.length > 1 ? "#e5e7eb" : accentColor }}>
                  <div>
                    <div className="text-sm font-semibold">{option.label}</div>
                    <div className="text-2xl font-bold" style={{ color: accentColor }}>
                      {formatMoney(option.totalCents)}
                    </div>
                  </div>
                  <AcceptOptionForm token={token} optionId={option.id} accentColor={accentColor} />
                </div>
              ))}
            </div>
          </section>

          <section className="mt-8 rounded-lg border p-4" style={{ borderColor: "#e5e7eb" }}>
            <h2 className="text-sm font-semibold text-[#1a1a1a]">Have a question first?</h2>
            <p className="mt-1 mb-2 text-xs text-[#555]">
              Leave a note and we&apos;ll follow up — this doesn&apos;t use up your link, so you can still come back and accept.
            </p>
            <FeedbackForm token={token} accentColor={accentColor} />
          </section>
        </>
      ) : (
        <section className="mt-10 rounded-lg border p-4 text-center text-sm text-[#555]">This proposal isn&apos;t ready for review yet.</section>
      )}
    </div>
  );
}
