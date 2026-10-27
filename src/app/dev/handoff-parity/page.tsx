/**
 * Component-chrome fixtures for Handoff estimate→proposal screenshots.
 * No DB — not linked from nav. Open /dev/handoff-parity.
 */

"use client";

import { useEffect, useState } from "react";

import { ConvertToMenu } from "@/components/estimates/ConvertToMenu";
import { EstimateHandyDock } from "@/components/estimates/EstimateHandyDock";
import { EstimateProposalToggle } from "@/components/estimates/EstimateProposalToggle";
import { EstimateSpreadsheet, type SpreadsheetGroup } from "@/components/estimates/EstimateSpreadsheet";
import { ClientProposalView } from "@/components/proposals/ClientProposalView";
import { THEME_STORAGE_KEY, type ThemePreference } from "@/components/settings/theme";

const DEMO_GROUPS: SpreadsheetGroup[] = [
  {
    label: "Demolition & Site Prep",
    groupClientTotalCents: 39_200,
    items: [
      {
        id: "d1",
        title: "Site Protection and Debris Haul-off Supplies",
        description: "Protection paper, bags, haul-off",
        costCodeLabel: "02.100 · Demolition",
        costType: "MATERIAL",
        quantityMilli: 1_000,
        unit: "ls",
        unitCostCents: 5_000,
        rateMode: "MARKUP",
        rateBasisPoints: 1_200,
        builderCostCents: 5_000,
        clientTotalCents: 5_600,
      },
      {
        id: "d2",
        title: "Demolition & Site Prep Labor",
        description: "Careful removal of damaged brick",
        costCodeLabel: "02.100 · Demolition",
        costType: "LABOR",
        quantityMilli: 3_000,
        unit: "hr",
        unitCostCents: 10_000,
        rateMode: "MARKUP",
        rateBasisPoints: 1_200,
        builderCostCents: 30_000,
        clientTotalCents: 33_600,
      },
    ],
  },
  {
    label: "Masonry",
    groupClientTotalCents: 143_910,
    items: [
      {
        id: "m1",
        title: 'Matching Structural Brick 3-5/8" × 2-1/4" × 8"',
        description: "Source matching brick",
        costCodeLabel: "04.200 · Masonry",
        costType: "MATERIAL",
        quantityMilli: 80_000,
        unit: "ea",
        unitCostCents: 375,
        rateMode: "MARKUP",
        rateBasisPoints: 1_200,
        builderCostCents: 30_000,
        clientTotalCents: 33_600,
      },
      {
        id: "m2",
        title: "Masonry Labor",
        description: "Masonry labor and Type N mortar",
        costCodeLabel: "04.200 · Masonry",
        costType: "LABOR",
        quantityMilli: 10_000,
        unit: "hr",
        unitCostCents: 10_000,
        rateMode: "MARKUP",
        rateBasisPoints: 1_200,
        builderCostCents: 100_000,
        clientTotalCents: 112_000,
      },
    ],
  },
];

const TOTAL_COST = DEMO_GROUPS.reduce(
  (sum, g) => sum + g.items.reduce((s, i) => s + i.builderCostCents, 0),
  0,
);
const TOTAL_CLIENT = DEMO_GROUPS.reduce((sum, g) => sum + g.groupClientTotalCents, 0);

type Panel = "estimate" | "handy" | "proposal" | "mobile";

export default function HandoffParityFixturePage() {
  const [panel, setPanel] = useState<Panel>("estimate");
  const [theme, setTheme] = useState<ThemePreference>("light");

  useEffect(() => {
    const current =
      (document.documentElement.getAttribute("data-theme") as ThemePreference | null) ?? "light";
    queueMicrotask(() => setTheme(current === "dark" ? "dark" : "light"));
  }, []);

  function setThemePreference(next: ThemePreference) {
    setTheme(next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
    document.documentElement.setAttribute("data-theme", next);
  }

  return (
    <div className="min-h-screen bg-[var(--bt-page-bg)] p-3 sm:p-4">
      <div className="mx-auto mb-3 flex max-w-[1400px] flex-wrap items-center gap-2">
        {(
          [
            ["estimate", "Estimate desktop"],
            ["handy", "Handy dock"],
            ["proposal", "Client proposal"],
            ["mobile", "Estimate mobile"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setPanel(id)}
            className="min-h-10 touch-manipulation rounded-md border px-3 py-1.5 text-xs font-semibold sm:min-h-0"
            style={{
              borderColor: "var(--bt-border)",
              background: panel === id ? "var(--bt-primary)" : "var(--bt-panel-bg)",
              color: panel === id ? "var(--bt-on-primary)" : "var(--bt-text)",
            }}
          >
            {label}
          </button>
        ))}
        <div className="ml-auto flex gap-1" data-testid="parity-theme-toggle">
          {(["light", "dark"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setThemePreference(mode)}
              className="min-h-10 touch-manipulation rounded-md border px-3 py-1.5 text-xs font-semibold capitalize sm:min-h-0"
              style={{
                borderColor: "var(--bt-border)",
                background: theme === mode ? "var(--bt-primary)" : "var(--bt-panel-bg)",
                color: theme === mode ? "var(--bt-on-primary)" : "var(--bt-text)",
              }}
            >
              {mode}
            </button>
          ))}
        </div>
      </div>

      {panel === "estimate" || panel === "mobile" ? (
        <div
          className={`mx-auto flex gap-2.5 ${panel === "mobile" ? "max-w-md flex-col" : "max-w-[1400px]"}`}
          data-testid="parity-estimate"
        >
          <div className="min-w-0 flex-1 space-y-2">
            <div
              className="sticky top-0 z-10 space-y-1.5 rounded-md border px-3 py-2"
              style={{ borderColor: "var(--bt-border)", background: "var(--bt-panel-bg)" }}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="flex items-center gap-1.5 text-[10px] text-[var(--bt-muted)]">
                    <span>Kalman Ezagui</span>
                    <span aria-hidden>·</span>
                    <span
                      className="rounded px-1.5 py-px text-[9px] font-bold text-[var(--bt-on-primary)]"
                      style={{ background: "var(--bt-primary)" }}
                    >
                      EST
                    </span>
                  </div>
                  <h1 className="text-base font-semibold sm:text-lg">Kalman Ezagui Brick Repair</h1>
                </div>
                <ConvertToMenu
                  estimateId="fixture-est"
                  linkedProposalId={null}
                  canConvertToProposal={false}
                  pdfHref={null}
                  csvHref="#"
                />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap gap-1.5">
                  <span
                    className="rounded border px-2 py-0.5 text-[10px] font-semibold text-[var(--bt-muted)]"
                    style={{ borderColor: "var(--bt-border)" }}
                  >
                    No catalogs applied
                  </span>
                  <span
                    className="rounded border px-2 py-0.5 text-[10px] font-semibold text-[var(--bt-muted)]"
                    style={{ borderColor: "var(--bt-border)" }}
                  >
                    3 instructions
                  </span>
                </div>
                <EstimateProposalToggle
                  active="estimate"
                  estimateHref="#estimate"
                  proposalHref="#proposal"
                />
              </div>
            </div>
            <EstimateSpreadsheet
              groups={DEMO_GROUPS}
              totalBuilderCostCents={TOTAL_COST}
              totalClientCents={TOTAL_CLIENT}
            />
          </div>
          {panel === "estimate" ? (
            <EstimateHandyDock
              leadId="fixture-lead"
              leadName="Kalman Ezagui"
              estimateId="fixture-est"
              proposalId={null}
              estimateTitle="Kalman Ezagui Brick Repair"
              jarvisUiEnabled={false}
              anthropicConfigured={false}
              scopeGroups={[
                {
                  label: "Demolition & Site Prep",
                  summary: "Demolition labor · Debris haul-off",
                  hoursLabel: "3 hrs",
                  totalLabel: "$392.00",
                  lineCount: 2,
                },
                {
                  label: "Masonry",
                  summary: "Replacement brick · Masonry labor",
                  hoursLabel: "10 hrs",
                  totalLabel: "$1,439.10",
                  lineCount: 2,
                },
              ]}
              pricingTerms={{
                totalLabel: "$1,831.10",
                costLabel: "$1,650.00",
                markupLabel: "$181.10",
                marginLabel: "9.9%",
                lineItemCount: 4,
                laborRateLabel: "$100.00/hr",
                typicalMarkupLabel: "12.0%",
                notes: "Nothing sends until you Convert → Proposal and send.",
              }}
              projectAddress="2326 Laurel Rd, Jacksonville, FL"
              canConvertToProposal
            />
          ) : null}
        </div>
      ) : null}

      {panel === "handy" ? (
        <div className="mx-auto h-[min(90vh,44rem)] max-w-sm" data-testid="parity-handy">
          <div className="flex h-full [&_aside]:h-full [&_aside]:max-h-none [&_aside]:lg:static">
          <EstimateHandyDock
            leadId="fixture-lead"
            leadName="Kalman Ezagui"
            estimateId="fixture-est"
            proposalId={null}
            estimateTitle="Kalman Ezagui Brick Repair"
            jarvisUiEnabled={false}
            anthropicConfigured={false}
            scopeGroups={[
              {
                label: "Demolition & Site Prep",
                summary: "Demolition labor · Debris haul-off · 4 hrs",
                hoursLabel: null,
                totalLabel: "$392.00",
                lineCount: 2,
              },
              {
                label: "Masonry",
                summary: "Replacement brick · Masonry labor · +1 more · 10 hrs",
                hoursLabel: null,
                totalLabel: "$1,439.10",
                lineCount: 2,
              },
            ]}
            pricingTerms={{
              totalLabel: "$1,831.10",
              costLabel: "$1,634.00",
              markupLabel: "$197.10",
              marginLabel: "10.8%",
              lineItemCount: 5,
              laborRateLabel: "$100.00/hr",
              typicalMarkupLabel: "12.0%",
              notes: "Nothing sends until you Convert → Proposal and send.",
            }}
            projectAddress="2326 Laurel Rd, Jacksonville, FL"
            canConvertToProposal
          />
          </div>
        </div>
      ) : null}

      {panel === "proposal" ? (
        <div className="mx-auto max-w-3xl bg-[var(--bt-panel-bg-muted)] p-4" data-testid="parity-proposal">
          <ClientProposalView
            title="Kalman Ezagui Brick Repair"
            projectAddress="2326 Laurel Rd, Jacksonville, FL"
            client={{ name: "Kalman Ezagui", email: "kalman@example.com", phone: "904-555-0100" }}
            organization={{
              name: "World Construction Inc",
              addressLine1: "6005 Powers Ave. #210",
              city: "Jacksonville",
              state: "FL",
              postalCode: "32217",
              contactEmail: "office@worldconstructioninc.com",
              contactPhone: "904-717-1729",
              slogan: "Leaders in quality construction since 1994.",
            }}
            createdAt={new Date("2026-10-27T12:00:00Z")}
            coverMessage="Thank you for the opportunity to restore the brick wall. Scope includes careful demolition, matching brick, and Type N mortar."
            sections={[
              {
                id: "s1",
                title: "Demolition & Site Prep",
                priceCents: 39_200,
                bullets: [
                  { id: "b1", text: "Careful removal of damaged brick" },
                  { id: "b2", text: "Debris haul-off" },
                ],
              },
              {
                id: "s2",
                title: "Masonry",
                priceCents: 143_910,
                bullets: [
                  { id: "b3", text: "Source matching brick" },
                  { id: "b4", text: "Masonry labor and Type N mortar" },
                ],
              },
            ]}
            draws={[]}
            options={[{ id: "o1", label: "Option 1", totalCents: TOTAL_CLIENT }]}
            accentColor={null}
            logoUrl={null}
            quantities={[
              { id: "q1", label: "Replacement brick", quantityLabel: "80 EA" },
              { id: "q2", label: "Masonry labor", quantityLabel: "10 HR" },
            ]}
            mode="preview"
          />
        </div>
      ) : null}
    </div>
  );
}
