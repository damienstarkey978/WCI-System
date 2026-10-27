/**
 * Right-rail Jarvis Handy companion — Handoff metaphor: scope prose by trade,
 * Pricing & terms, then Ask Jarvis. WCI colors (not dark-mode copy).
 */

"use client";

import { useEffect, useState } from "react";

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
          title="Ask Jarvis"
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

  return (
    <aside
      className="flex w-full shrink-0 flex-col overflow-hidden rounded-xl border lg:sticky lg:top-2 lg:w-[19.5rem] lg:self-start xl:w-[21rem]"
      style={{
        borderColor: "color-mix(in srgb, var(--bt-primary) 28%, var(--bt-border))",
        background: "var(--bt-panel-bg)",
        maxHeight: "calc(100vh - 4.5rem)",
      }}
    >
      <div
        className="flex items-center justify-between gap-2 border-b px-3 py-1.5"
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
        <button
          type="button"
          onClick={toggle}
          className="rounded px-1.5 py-0.5 text-xs text-[var(--bt-muted)] hover:text-[var(--bt-text)]"
          aria-label="Collapse Handy"
        >
          »
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
        {groups.length > 0 || trimmedNotes ? (
          <div className="space-y-2 px-0.5">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--bt-muted)]">Scope</p>
            {groups.length > 0 ? (
              <ul className="space-y-2">
                {groups.map((group) => (
                  <li key={group.label} className="text-[11px] leading-snug text-[var(--bt-text)]">
                    <p className="font-semibold">
                      {group.label}
                      {group.hoursLabel ? (
                        <span className="ml-1 font-normal text-[var(--bt-muted)]">({group.hoursLabel})</span>
                      ) : null}
                    </p>
                    <p className="mt-0.5 text-[var(--bt-muted)]">{group.summary}</p>
                    <p className="mt-0.5 tabular-nums text-[var(--bt-muted)]">
                      {group.lineCount} line{group.lineCount === 1 ? "" : "s"} · {group.totalLabel}
                    </p>
                  </li>
                ))}
              </ul>
            ) : trimmedNotes ? (
              <p className="max-h-32 overflow-y-auto whitespace-pre-wrap text-[11px] leading-relaxed text-[var(--bt-text)]">
                {trimmedNotes.length > 800 ? `${trimmedNotes.slice(0, 800)}…` : trimmedNotes}
              </p>
            ) : null}
            {groups.length > 0 && trimmedNotes ? (
              <details className="text-[10px] text-[var(--bt-muted)]">
                <summary className="cursor-pointer font-semibold hover:text-[var(--bt-text)]">Lead notes</summary>
                <p className="mt-1 max-h-24 overflow-y-auto whitespace-pre-wrap leading-relaxed">
                  {trimmedNotes.length > 500 ? `${trimmedNotes.slice(0, 500)}…` : trimmedNotes}
                </p>
              </details>
            ) : null}
          </div>
        ) : null}

        {pricingTerms ? (
          <div
            className="space-y-1 rounded-lg border px-2.5 py-2"
            style={{ borderColor: "var(--bt-border)", background: "var(--bt-panel-bg-muted)" }}
          >
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--bt-muted)]">
              Pricing &amp; terms
            </p>
            {pricingTerms.laborRateLabel || pricingTerms.typicalMarkupLabel ? (
              <ul className="space-y-0.5 text-[11px] text-[var(--bt-text)]">
                {pricingTerms.laborRateLabel ? <li>Labor {pricingTerms.laborRateLabel}</li> : null}
                {pricingTerms.typicalMarkupLabel ? (
                  <li>Typical markup {pricingTerms.typicalMarkupLabel}</li>
                ) : null}
                {pricingTerms.notes ? <li className="text-[var(--bt-muted)]">{pricingTerms.notes}</li> : null}
              </ul>
            ) : null}
            <p className="pt-1 text-[12px] font-semibold tabular-nums text-[var(--bt-text)]">
              Client grand total: {pricingTerms.totalLabel}
            </p>
            <p className="text-[10px] tabular-nums text-[var(--bt-muted)]">
              Cost {pricingTerms.costLabel} + markup {pricingTerms.markupLabel} · margin{" "}
              {pricingTerms.marginLabel} · {pricingTerms.lineItemCount} lines
            </p>
          </div>
        ) : null}

        {estimateId ? (
          <div
            className="rounded-lg border px-2.5 py-2"
            style={{ borderColor: "var(--bt-border)", background: "var(--bt-panel-bg)" }}
          >
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--bt-muted)]">Estimate</p>
            <p className="mt-0.5 truncate text-[12px] font-semibold text-[var(--bt-text)]">
              {estimateTitle ?? "Current draft"}
            </p>
            {pricingTerms ? (
              <p className="text-[11px] tabular-nums text-[var(--bt-muted)]">
                {pricingTerms.lineItemCount} items · {pricingTerms.totalLabel}
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="border-t pt-2" style={{ borderColor: "var(--bt-border)" }}>
          <p className="mb-1.5 px-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--bt-muted)]">
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
              emptyStateHint="Ask Handy to adjust quantities, add trades, or tighten narrative. DRAFT until you send."
              composerPlaceholder="Ask Handy"
              heightClassName="h-[16rem] min-h-[12rem] sm:h-[18rem] lg:h-[min(40vh,22rem)]"
              navigateOnEstimateDraft
            />
          ) : (
            <p className="p-2 text-xs text-[var(--bt-muted)]">
              Jarvis needs NEXT_PUBLIC_JARVIS_UI_ENABLED and ANTHROPIC_API_KEY to chat here.
            </p>
          )}
        </div>
      </div>
    </aside>
  );
}
