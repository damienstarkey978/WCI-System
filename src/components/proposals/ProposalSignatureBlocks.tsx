/**
 * Dual signature blocks: Owner/Client + World Construction Inc.
 * Client signs via review-link PROPOSAL_ACCEPTANCE; WCI counter-signs as staff.
 * Colors track the app theme via --bt-* (print paper overrides come from
 * ClientProposalView's scoped vars when mode=print).
 */

import type { ReactNode } from "react";

import { formatDate } from "@/lib/format";

export type ProposalSignatureSide = {
  readonly name: string | null;
  readonly signedAt: Date | null;
  readonly hash: string | null;
};

export function ProposalSignatureBlocks({
  client,
  company,
  companyLabel = "World Construction Inc.",
  clientLabel = "Owner / Client",
  clientCta,
  companyCta,
}: {
  readonly client: ProposalSignatureSide;
  readonly company: ProposalSignatureSide;
  readonly companyLabel?: string;
  readonly clientLabel?: string;
  readonly clientCta?: ReactNode;
  readonly companyCta?: ReactNode;
}) {
  return (
    <section className="mt-6 border-t border-[var(--bt-border)] pt-4 sm:mt-8 sm:pt-5">
      <h2 className="text-sm font-semibold text-[var(--bt-text)]">Signatures</h2>
      <p className="mt-1 text-[11px] text-[var(--bt-muted)] sm:text-xs">
        World Construction Inc. may counter-sign before sending. The client signs on the review link to accept.
      </p>
      <div className="mt-3 grid gap-3 sm:mt-4 sm:grid-cols-2 sm:gap-4">
        <SignatureCard label={clientLabel} side={client} cta={clientCta} />
        <SignatureCard label={companyLabel} side={company} cta={companyCta} />
      </div>
    </section>
  );
}

function SignatureCard({
  label,
  side,
  cta,
}: {
  readonly label: string;
  readonly side: ProposalSignatureSide;
  readonly cta?: ReactNode;
}) {
  const signed = Boolean(side.signedAt && side.name);
  return (
    <div className="rounded-lg border border-[var(--bt-border)] bg-[var(--bt-panel-bg-muted)] p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--bt-muted)]">{label}</div>
        <span
          className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
          style={
            signed
              ? { background: "var(--bt-status-open-bg)", color: "var(--bt-status-open-text)" }
              : {
                  background: "color-mix(in srgb, var(--bt-hazard) 16%, var(--bt-panel-bg))",
                  color: "var(--bt-hazard)",
                }
          }
        >
          {signed ? "Signed" : "Unsigned"}
        </span>
      </div>
      {signed ? (
        <div className="mt-3 space-y-1">
          <div className="border-b border-[var(--bt-text)] pb-1 font-serif text-lg italic leading-none text-[var(--bt-text)]">
            {side.name}
          </div>
          <div className="text-xs text-[var(--bt-muted)]">Signed {formatDate(side.signedAt)}</div>
          {side.hash ? (
            <div className="break-all font-mono text-[9px] text-[var(--bt-muted)]">Hash {side.hash.slice(0, 16)}…</div>
          ) : null}
        </div>
      ) : (
        <div className="mt-3">
          <div className="border-b border-dashed border-[var(--bt-border)] pb-6 text-xs text-[var(--bt-muted)]">
            Awaiting signature
          </div>
          {cta ? <div className="mt-3">{cta}</div> : null}
        </div>
      )}
    </div>
  );
}
