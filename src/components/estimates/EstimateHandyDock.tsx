/**
 * Right-rail Jarvis Handy companion — Handoff metaphor: scrollable scope prose,
 * compact estimate card, Ask Handy chat pinned to the bottom of the rail.
 * Uses shared --bt-* tokens so the existing dark-theme toggle applies.
 */

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { CreateProposalFromEstimateButton } from "@/app/leads/estimates/[estimateId]/create-proposal-button";
import { JarvisChatPanel } from "@/components/jarvis/JarvisChatPanel";
import { JARVIS_LEAD_PROPOSAL_SUGGESTIONS } from "@/lib/jarvis/suggestions";

const STORAGE_KEY = "wci-estimate-handy-open";

export type HandyScopeGroup = {
  readonly label: string;
  readonly summary: string;
  readonly hoursLabel: string | null;
  readonly totalLabel: string;
  readonly lineCount: number;
};

export type HandyPricingTerms = {
  readonly totalLabel: string;
  readonly costLabel: string;
  readonly markupLabel: string;
  readonly marginLabel: string;
  readonly lineItemCount: number;
  readonly laborRateLabel: string | null;
  readonly typicalMarkupLabel: string | null;
  readonly notes: string | null;
};

export function EstimateHandyDock({
  leadId,
  leadName,
  estimateId,
  proposalId,
  estimateTitle,
  jarvisUiEnabled,
  anthropicConfigured,
  scopeNotes,
  scopeGroups,
  pricingTerms,
  projectAddress = null,
  canConvertToProposal = false,
}: {
  readonly leadId: string;
  readonly leadName: string;
  readonly estimateId: string | null;
  readonly proposalId: string | null;
  readonly estimateTitle?: string | null;
  readonly jarvisUiEnabled: boolean;
  readonly anthropicConfigured: boolean;
  readonly scopeNotes?: string | null;
  readonly scopeGroups?: readonly HandyScopeGroup[];
  readonly pricingTerms?: HandyPricingTerms | null;
  /** Truncated location chip in Ask Handy (Handoff shows job address). */
  readonly projectAddress?: string | null;
  /** One-click Convert on the estimate card (lands on Proposal view). */
  readonly canConvertToProposal?: boolean;
}) {
  const ready = jarvisUiEnabled && anthropicConfigured;
  const [open, setOpen] = useState(true);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      queueMicrotask(() => {
        if (stored === "0") setOpen(false);
        else if (stored === "1") setOpen(true);
      });
    } catch {
      /* ignore */
    }
  }, []);

  function toggle() {
    setOpen((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  if (!open) {
    return (
      <div className="flex shrink-0 flex-col gap-2 lg:w-9">
        <button
          type="button"
          onClick={toggle}
          className="inline-flex min-h-11 touch-manipulation items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold lg:min-h-0 lg:flex-col lg:px-1 lg:py-3"
          style={{
            borderColor: "color-mix(in srgb, var(--bt-primary) 35%, var(--bt-border))",
            background: "color-mix(in srgb, var(--bt-primary) 10%, var(--bt-panel-bg))",
            color: "var(--bt-primary)",
          }}
          title="Ask Handy"
        >
          <span aria-hidden>✦</span>
          <span className="text-[10px] uppercase tracking-wide lg:[writing-mode:vertical-rl] lg:rotate-180">
            Handy
          </span>
        </button>
      </div>
    );
  }

  const trimmedNotes = scopeNotes?.trim() ?? "";
  const groups = scopeGroups ?? [];
  const addressChip = projectAddress?.trim()
    ? projectAddress.trim().length > 18
      ? `${projectAddress.trim().slice(0, 16)}…`
      : projectAddress.trim()
    : null;

  return (
    <aside
      className="flex w-full shrink-0 flex-col overflow-hidden rounded-xl border lg:sticky lg:top-2 lg:h-[calc(100vh-4.5rem)] lg:w-[20rem] lg:self-start xl:w-[22rem]"
      style={{
        borderColor: "color-mix(in srgb, var(--bt-primary) 28%, var(--bt-border))",
        background: "var(--bt-panel-bg)",
        maxHeight: "calc(100vh - 4.5rem)",
      }}
    >
      <div
        className="flex shrink-0 items-center justify-between gap-2 border-b px-2.5 py-1.5"
        style={{ borderColor: "var(--bt-border)" }}
      >
        <div className="flex min-w-0 items-center gap-1.5">
          <span
            className="inline-flex h-5 w-5 items-center justify-center rounded text-[10px] font-bold text-[var(--bt-on-primary)]"
            style={{ background: "var(--bt-primary)" }}
            aria-hidden
          >
            ✦
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold text-[var(--bt-text)]">Handy</p>
            <p className="truncate text-[10px] text-[var(--bt-muted)]">{leadName}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            onClick={toggle}
            className="rounded px-1.5 py-0.5 text-xs text-[var(--bt-muted)] hover:text-[var(--bt-text)]"
            aria-label="Collapse Handy"
            title="Collapse"
          >
            »
          </button>
        </div>
      </div>

      {/* Scrollable summary — Handoff puts scope + estimate card above Ask */}
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
        {groups.length > 0 || trimmedNotes ? (
          <div className="space-y-1.5 px-0.5">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--bt-muted)]">
              Overview &amp; key assumptions
            </p>
            {groups.length > 0 ? (
              <ul className="space-y-1.5">
                {groups.map((group) => (
                  <li key={group.label} className="text-[11px] leading-snug text-[var(--bt-text)]">
                    <p>
                      <span className="font-semibold">{group.label}:</span>{" "}
                      <span className="text-[var(--bt-muted)]">{group.summary}</span>
                      {group.hoursLabel ? (
                        <span className="text-[var(--bt-muted)]"> · {group.hoursLabel}</span>
                      ) : null}
                    </p>
                    <p className="mt-0.5 tabular-nums text-[10px] text-[var(--bt-muted)]">
                      {group.totalLabel}
                    </p>
                  </li>
                ))}
              </ul>
            ) : trimmedNotes ? (
              <p className="max-h-28 overflow-y-auto whitespace-pre-wrap text-[11px] leading-relaxed text-[var(--bt-text)]">
                {trimmedNotes.length > 800 ? `${trimmedNotes.slice(0, 800)}…` : trimmedNotes}
              </p>
            ) : null}
            {groups.length > 0 && trimmedNotes ? (
              <details className="text-[10px] text-[var(--bt-muted)]">
                <summary className="cursor-pointer font-semibold hover:text-[var(--bt-text)]">Lead notes</summary>
                <p className="mt-1 max-h-20 overflow-y-auto whitespace-pre-wrap leading-relaxed">
                  {trimmedNotes.length > 500 ? `${trimmedNotes.slice(0, 500)}…` : trimmedNotes}
                </p>
              </details>
            ) : null}
          </div>
        ) : null}

        {pricingTerms ? (
          <div className="space-y-1 px-0.5">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--bt-muted)]">
              Pricing &amp; terms
            </p>
            <ul className="space-y-0.5 text-[11px] text-[var(--bt-text)]">
              {pricingTerms.laborRateLabel ? <li>Labor {pricingTerms.laborRateLabel}</li> : null}
              {pricingTerms.typicalMarkupLabel ? (
                <li>Typical markup {pricingTerms.typicalMarkupLabel}</li>
              ) : null}
              <li className="text-[var(--bt-muted)]">
                Cost {pricingTerms.costLabel} + markup {pricingTerms.markupLabel} · margin{" "}
                {pricingTerms.marginLabel}
              </li>
              {pricingTerms.notes ? <li className="text-[var(--bt-muted)]">{pricingTerms.notes}</li> : null}
            </ul>
          </div>
        ) : null}

        {estimateId ? (
          <div
            className="rounded-lg border px-2.5 py-2"
            style={{ borderColor: "var(--bt-border)", background: "var(--bt-panel-bg-muted)" }}
          >
            <p className="truncate text-[12px] font-semibold text-[var(--bt-text)]">
              {estimateTitle ?? "Current draft"}
            </p>
            {pricingTerms ? (
              <p className="mt-0.5 text-[11px] tabular-nums text-[var(--bt-muted)]">
                {pricingTerms.lineItemCount} item{pricingTerms.lineItemCount === 1 ? "" : "s"} ·{" "}
                <span className="font-semibold text-[var(--bt-text)]">{pricingTerms.totalLabel}</span>
              </p>
            ) : null}
            {proposalId ? (
              <Link
                href={`/leads/proposals/${proposalId}?view=proposal`}
                className="mt-2 inline-flex min-h-8 w-full touch-manipulation items-center justify-center rounded-md border px-2 py-1.5 text-[11px] font-semibold text-[var(--bt-text)] hover:bg-[var(--bt-panel-bg)]"
                style={{ borderColor: "var(--bt-border)", background: "var(--bt-panel-bg)" }}
              >
                View proposal
              </Link>
            ) : canConvertToProposal && estimateId ? (
              <CreateProposalFromEstimateButton estimateId={estimateId} variant="dock" />
            ) : (
              <p className="mt-1.5 text-[10px] text-[var(--bt-muted)]">
                Use Convert to → Proposal when numbers look right.
              </p>
            )}
          </div>
        ) : null}
      </div>

      {/* Pinned Ask Handy — flex child so Overview keeps room above the composer */}
      <div
        className="flex min-h-0 flex-[1.15] flex-col border-t lg:min-h-[12rem]"
        style={{ borderColor: "var(--bt-border)" }}
      >
        <p className="shrink-0 px-2.5 pt-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--bt-muted)]">
          Ask Handy
        </p>
        {ready ? (
          <JarvisChatPanel
            context={{
              page: "lead_detail",
              leadId,
              leadName,
              estimateId,
              proposalId,
              tab: "proposals",
            }}
            storageKey={`estimate-handy:${leadId}:${estimateId ?? proposalId ?? "none"}`}
            suggestions={[...JARVIS_LEAD_PROPOSAL_SUGGESTIONS]}
            emptyStateHint="Adjust quantities, add trades, or tighten narrative. DRAFT until you send."
            composerPlaceholder="Ask Handy"
            heightClassName="min-h-0 flex-1"
            chrome="docked"
            locationChip={addressChip}
            navigateOnEstimateDraft
          />
        ) : (
          <HandyComposerStub
            locationChip={addressChip}
            suggestions={JARVIS_LEAD_PROPOSAL_SUGGESTIONS.slice(0, 3)}
          />
        )}
      </div>
    </aside>
  );
}

/** Visual Ask Handy chrome when Jarvis keys are off — keeps the dock Handoff-shaped. */
function HandyComposerStub({
  locationChip,
  suggestions,
}: {
  readonly locationChip: string | null;
  readonly suggestions: readonly string[];
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-1 flex-col justify-end gap-1.5 p-2">
        <p className="text-center text-[10px] leading-snug text-[var(--bt-muted)]">
          Adjust quantities, add trades, or tighten narrative. DRAFT until you send.
        </p>
        <div className="flex flex-wrap justify-start gap-1">
          {suggestions.map((suggestion) => (
            <span
              key={suggestion}
              className="max-w-full truncate rounded-full border px-2 py-0.5 text-[10px] text-[var(--bt-muted)]"
              style={{ borderColor: "var(--bt-border)" }}
              title={suggestion}
            >
              {suggestion.length > 36 ? `${suggestion.slice(0, 34)}…` : suggestion}
            </span>
          ))}
        </div>
      </div>
      <div className="border-t p-1.5" style={{ borderColor: "var(--bt-border)" }}>
        <div
          className="overflow-hidden rounded-xl border bg-[var(--bt-panel-bg)]"
          style={{ borderColor: "var(--bt-border)" }}
        >
          <p className="px-3 pt-2 text-base text-[var(--bt-muted)]">Ask Handy</p>
          <p className="px-3 pb-0.5 text-[10px] text-[var(--bt-muted)]">Use Ctrl + Enter to submit</p>
          <div className="flex items-center gap-1 px-1.5 pb-1 pt-0.5">
            <span
              className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[var(--bt-muted)]"
              aria-hidden
            >
              +
            </span>
            {locationChip ? (
              <span
                className="inline-flex max-w-[7.5rem] items-center gap-0.5 truncate rounded-full border px-1.5 py-0.5 text-[10px] font-medium text-[var(--bt-muted)]"
                style={{ borderColor: "var(--bt-border)", background: "var(--bt-panel-bg-muted)" }}
              >
                {locationChip}
              </span>
            ) : null}
            <div className="min-w-0 flex-1" />
            <span
              className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[var(--bt-on-primary)] opacity-50"
              style={{ background: "var(--bt-primary)" }}
              aria-hidden
            >
              ↑
            </span>
          </div>
        </div>
        <p className="mt-1 px-0.5 text-[10px] text-[var(--bt-muted)]">
          Enable Jarvis UI + Anthropic to chat here.
        </p>
      </div>
    </div>
  );
}
