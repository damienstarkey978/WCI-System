"use client";

import { useActionState, useState } from "react";

import { formatMoney } from "@/lib/format";

import { deleteLineItemAction, updateLineItemAction, type ActionState } from "./actions";

const INITIAL: ActionState = {};

export interface EstimateLineItemData {
  readonly id: string;
  readonly title: string;
  readonly groupLabel: string | null;
  readonly costCodeLabel: string;
  readonly quantityMilli: number;
  readonly unitCostCents: number;
  readonly rateBasisPoints: number;
  readonly extendedCents: number;
  /** Set only on AI-drafted lines — null for hand-entered ones. */
  readonly confidence: "HIGH" | "MEDIUM" | "LOW" | null;
  /** Set only on AI-drafted lines — null for hand-entered ones. */
  readonly priceSource: "CATALOG" | "MARKET_RATE" | "MANUAL" | null;
}

const CONFIDENCE_STYLE: Record<"MEDIUM" | "LOW", { bg: string; text: string; label: string }> = {
  LOW: { bg: "#fee2e2", text: "#991b1b", label: "AI: low confidence" },
  MEDIUM: { bg: "#fef3c7", text: "#92400e", label: "AI: medium confidence" },
};

function LineItemBadges({ confidence, priceSource }: { confidence: EstimateLineItemData["confidence"]; priceSource: EstimateLineItemData["priceSource"] }) {
  if (!confidence && !priceSource) return null;
  const confidenceBadge = confidence && confidence !== "HIGH" ? CONFIDENCE_STYLE[confidence] : null;

  return (
    <div className="mt-0.5 flex flex-wrap gap-1">
      {confidenceBadge ? (
        <span className="rounded px-1 py-0.5 text-[9px] font-semibold" style={{ background: confidenceBadge.bg, color: confidenceBadge.text }}>
          {confidenceBadge.label}
        </span>
      ) : null}
      {priceSource === "MARKET_RATE" ? (
        <span className="rounded px-1 py-0.5 text-[9px] font-semibold" style={{ background: "#dbeafe", color: "#1e40af" }}>
          Market-rate estimate
        </span>
      ) : null}
    </div>
  );
}

export function EstimateLineItemRow({
  proposalId,
  estimateId,
  item,
  editable,
}: {
  proposalId: string;
  estimateId: string;
  item: EstimateLineItemData;
  editable: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [state, formAction, pending] = useActionState(updateLineItemAction, INITIAL);

  if (editing) {
    return (
      <tr className="border-b last:border-0" style={{ borderColor: "var(--bt-border)" }}>
        <td colSpan={5} className="px-3 py-2">
          <form action={formAction} className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="proposalId" value={proposalId} />
            <input type="hidden" name="estimateId" value={estimateId} />
            <input type="hidden" name="lineItemId" value={item.id} />
            <input
              name="title"
              defaultValue={item.title}
              required
              className="min-w-[10rem] flex-1 rounded border px-2 py-1 text-sm outline-none focus:border-[var(--bt-primary)]"
              style={{ borderColor: "var(--bt-border)" }}
            />
            <input
              name="groupLabel"
              defaultValue={item.groupLabel ?? ""}
              placeholder="Group"
              className="w-36 rounded border px-2 py-1 text-sm outline-none focus:border-[var(--bt-primary)]"
              style={{ borderColor: "var(--bt-border)" }}
            />
            <input
              name="quantity"
              defaultValue={item.quantityMilli / 1_000}
              inputMode="decimal"
              className="w-20 rounded border px-2 py-1 text-sm outline-none focus:border-[var(--bt-primary)]"
              style={{ borderColor: "var(--bt-border)" }}
              title="Quantity"
            />
            <input
              name="unitCost"
              defaultValue={(item.unitCostCents / 100).toFixed(2)}
              inputMode="decimal"
              className="w-24 rounded border px-2 py-1 text-sm outline-none focus:border-[var(--bt-primary)]"
              style={{ borderColor: "var(--bt-border)" }}
              title="Unit cost ($)"
            />
            <input
              name="ratePercent"
              defaultValue={item.rateBasisPoints / 100}
              inputMode="decimal"
              className="w-20 rounded border px-2 py-1 text-sm outline-none focus:border-[var(--bt-primary)]"
              style={{ borderColor: "var(--bt-border)" }}
              title="Rate %"
            />
            <button type="submit" disabled={pending} className="rounded px-2 py-1 text-xs font-semibold text-white disabled:opacity-50" style={{ background: "var(--bt-primary)" }}>
              {pending ? "…" : "Save"}
            </button>
            <button type="button" onClick={() => setEditing(false)} className="text-xs text-[var(--bt-muted)] hover:underline">
              Cancel
            </button>
            {state.error ? <span className="w-full text-xs text-red-600">{state.error}</span> : null}
          </form>
        </td>
      </tr>
    );
  }

  return (
    <tr className="group border-b last:border-0" style={{ borderColor: "var(--bt-border)" }}>
      <td className="px-3 py-2 text-[var(--bt-text)]">
        {item.title}
        <div className="text-xs text-[var(--bt-muted)]">{item.costCodeLabel}</div>
        <LineItemBadges confidence={item.confidence} priceSource={item.priceSource} />
      </td>
      <td className="px-3 py-2 text-right text-[var(--bt-muted)]">{item.quantityMilli / 1_000}</td>
      <td className="px-3 py-2 text-right text-[var(--bt-muted)]">{formatMoney(item.unitCostCents)}</td>
      <td className="px-3 py-2 text-right text-[var(--bt-text)]">{formatMoney(item.extendedCents)}</td>
      <td className="px-3 py-2 text-right">
        {editable ? (
          <span className="flex justify-end gap-2 text-xs opacity-0 group-hover:opacity-100">
            <button type="button" onClick={() => setEditing(true)} className="text-[var(--bt-primary)] hover:underline">
              Edit
            </button>
            <form action={deleteLineItemAction}>
              <input type="hidden" name="proposalId" value={proposalId} />
              <input type="hidden" name="estimateId" value={estimateId} />
              <input type="hidden" name="lineItemId" value={item.id} />
              <button type="submit" className="text-[var(--bt-muted)] hover:text-red-600 hover:underline">
                Remove
              </button>
            </form>
          </span>
        ) : null}
      </td>
    </tr>
  );
}
