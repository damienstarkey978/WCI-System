/**
 * Right-rail Jarvis Handy companion for the three-panel estimate workspace.
 * Handoff docks Handy on the RIGHT with scope / pricing context above Ask chat.
 * WCI colors — not a dark-mode clone.
 */

"use client";

import { useEffect, useState } from "react";

import { JarvisChatPanel } from "@/components/jarvis/JarvisChatPanel";
import { JARVIS_LEAD_PROPOSAL_SUGGESTIONS } from "@/lib/jarvis/suggestions";

const STORAGE_KEY = "wci-estimate-handy-open";

export function EstimateHandyDock({
  leadId,
  leadName,
  estimateId,
  proposalId,
  jarvisUiEnabled,
  anthropicConfigured,
  scopeNotes,
  pricingSummary,
}: {
  readonly leadId: string;
  readonly leadName: string;
  readonly estimateId: string | null;
  readonly proposalId: string | null;
  readonly jarvisUiEnabled: boolean;
  readonly anthropicConfigured: boolean;
  /** Lead / estimate scope prose shown above Ask Jarvis (Handoff Handy metaphor). */
  readonly scopeNotes?: string | null;
  readonly pricingSummary?: {
    readonly totalLabel: string;
    readonly lineItemCount: number;
    readonly marginLabel?: string | null;
  } | null;
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
      <div className="flex shrink-0 flex-col gap-2 lg:w-10">
        <button
          type="button"
          onClick={toggle}
          className="inline-flex min-h-11 touch-manipulation items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold lg:min-h-0 lg:flex-col lg:px-1.5 lg:py-3"
          style={{
            borderColor: "color-mix(in srgb, var(--bt-primary) 35%, var(--bt-border))",
            background: "color-mix(in srgb, var(--bt-primary) 10%, var(--bt-panel-bg))",
            color: "var(--bt-primary)",
          }}
          title="Ask Jarvis"
        >
          <span aria-hidden>✦</span>
          <span className="text-[10px] uppercase tracking-wide lg:[writing-mode:vertical-rl] lg:rotate-180">
            Ask Jarvis
          </span>
        </button>
      </div>
    );
  }

  const trimmedNotes = scopeNotes?.trim() ?? "";

  return (
    <aside
      className="flex w-full shrink-0 flex-col overflow-hidden rounded-xl border lg:sticky lg:top-2 lg:w-[20rem] lg:self-start xl:w-[22rem]"
      style={{
        borderColor: "color-mix(in srgb, var(--bt-primary) 28%, var(--bt-border))",
        background: "var(--bt-panel-bg)",
        maxHeight: "calc(100vh - 5rem)",
      }}
    >
      <div
        className="flex items-center justify-between gap-2 border-b px-3 py-2"
        style={{ borderColor: "var(--bt-border)" }}
      >
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: "var(--bt-primary)" }}>
            Ask Jarvis
          </p>
          <p className="truncate text-xs text-[var(--bt-muted)]">{leadName}</p>
        </div>
        <button
          type="button"
          onClick={toggle}
          className="rounded px-2 py-1 text-xs text-[var(--bt-muted)] hover:text-[var(--bt-text)]"
          aria-label="Collapse Jarvis"
        >
          »
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
        {trimmedNotes || pricingSummary ? (
          <div
            className="space-y-2 rounded-lg border px-2.5 py-2"
            style={{ borderColor: "var(--bt-border)", background: "var(--bt-panel-bg-muted)" }}
          >
            {trimmedNotes ? (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--bt-muted)]">Scope</p>
                <p className="mt-1 max-h-28 overflow-y-auto whitespace-pre-wrap text-xs leading-relaxed text-[var(--bt-text)]">
                  {trimmedNotes.length > 600 ? `${trimmedNotes.slice(0, 600)}…` : trimmedNotes}
                </p>
              </div>
            ) : null}
            {pricingSummary ? (
              <div className={trimmedNotes ? "border-t pt-2" : ""} style={{ borderColor: "var(--bt-border)" }}>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--bt-muted)]">
                  Pricing &amp; terms
                </p>
                <p className="mt-1 text-sm font-semibold tabular-nums text-[var(--bt-text)]">
                  Client total: {pricingSummary.totalLabel}
                </p>
                <p className="text-[11px] text-[var(--bt-muted)]">
                  {pricingSummary.lineItemCount} line{pricingSummary.lineItemCount === 1 ? "" : "s"}
                  {pricingSummary.marginLabel ? ` · Margin ${pricingSummary.marginLabel}` : ""}
                </p>
                <p className="mt-1 text-[10px] text-[var(--bt-muted)]">
                  Illustrative only until Convert → Proposal. Nothing sends until you send.
                </p>
              </div>
            ) : null}
          </div>
        ) : null}

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
            emptyStateHint="Ask Jarvis to adjust quantities, add trades, or tighten the proposal narrative. Changes stay DRAFT until you send."
            heightClassName="h-[20rem] min-h-[14rem] sm:h-[24rem] lg:h-[min(52vh,28rem)]"
            navigateOnEstimateDraft
          />
        ) : (
          <p className="p-3 text-xs text-[var(--bt-muted)]">
            Jarvis needs NEXT_PUBLIC_JARVIS_UI_ENABLED and ANTHROPIC_API_KEY to chat here.
          </p>
        )}
      </div>
    </aside>
  );
}
