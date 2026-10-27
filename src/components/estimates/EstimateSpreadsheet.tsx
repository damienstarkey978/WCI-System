/**
 * Handoff-density estimate spreadsheet: compact rows, Handoff column set
 * (Item · Quantity · Unit cost · Cost type · Client total), sticky totals
 * with optional cost/markup breakdown. WCI colors.
 */

"use client";

import { useActionState, useMemo, useState, useTransition } from "react";

import {
  reorderEstimateLineItemsAction,
  type ReorderActionState,
} from "@/app/leads/estimates/[estimateId]/reorder-actions";
import { resolveLineUnit } from "@/lib/estimates/units";
import { formatMoney, formatPercent } from "@/lib/format";

export type SpreadsheetLine = {
  readonly id: string;
  readonly title: string;
  readonly description: string | null;
  readonly costCodeLabel: string;
  readonly costType: string;
  readonly quantityMilli: number;
  readonly unit: string | null;
  readonly unitCostCents: number;
  readonly rateMode: string;
  readonly rateBasisPoints: number;
  readonly builderCostCents: number;
  readonly clientTotalCents: number;
};

export type SpreadsheetGroup = {
  readonly label: string;
  readonly items: readonly SpreadsheetLine[];
  readonly groupClientTotalCents: number;
};

const COST_TYPE_STYLE: Record<string, { bg: string; text: string }> = {
  LABOR: { bg: "#dbeafe", text: "#1e40af" },
  MATERIAL: { bg: "#f3f4f6", text: "#374151" },
  EQUIPMENT: { bg: "#fef3c7", text: "#92400e" },
  SUBCONTRACTOR: { bg: "#ede9fe", text: "#5b21b6" },
  OTHER: { bg: "#f3f4f6", text: "#4b5563" },
  NONE: { bg: "#f3f4f6", text: "#6b7280" },
};

function costTypeLabel(costType: string): string {
  if (costType === "NONE") return "—";
  return costType.charAt(0) + costType.slice(1).toLowerCase();
}

function formatQty(quantityMilli: number): string {
  return (quantityMilli / 1000).toLocaleString("en-US", { maximumFractionDigits: 3 });
}

function formatQtyWithUnit(quantityMilli: number, unit: string): string {
  return `${formatQty(quantityMilli)} ${unit.toUpperCase()}`;
}

function DragHandle() {
  return (
    <span
      className="mt-px hidden shrink-0 cursor-grab text-[var(--bt-muted)] opacity-50 active:cursor-grabbing sm:inline-flex"
      aria-hidden
    >
      <svg width="8" height="12" viewBox="0 0 10 14" fill="currentColor">
        <circle cx="3" cy="2" r="1.1" />
        <circle cx="7" cy="2" r="1.1" />
        <circle cx="3" cy="7" r="1.1" />
        <circle cx="7" cy="7" r="1.1" />
        <circle cx="3" cy="12" r="1.1" />
        <circle cx="7" cy="12" r="1.1" />
      </svg>
    </span>
  );
}

export function EstimateSpreadsheet({
  groups,
  totalBuilderCostCents,
  totalClientCents,
  estimateId,
  proposalId = null,
  reorderable = false,
}: {
  readonly groups: readonly SpreadsheetGroup[];
  readonly totalBuilderCostCents: number;
  readonly totalClientCents: number;
  readonly estimateId?: string;
  readonly proposalId?: string | null;
  readonly reorderable?: boolean;
}) {
  const totalMarkupCents = totalClientCents - totalBuilderCostCents;
  const marginBasisPoints =
    totalClientCents > 0 ? Math.round((totalMarkupCents / totalClientCents) * 10_000) : 0;

  const flatIds = useMemo(() => groups.flatMap((group) => group.items.map((item) => item.id)), [groups]);
  const groupsKey = useMemo(() => flatIds.join("|"), [flatIds]);
  const [draftKey, setDraftKey] = useState(groupsKey);
  const [localGroups, setLocalGroups] = useState(groups);
  if (draftKey !== groupsKey) {
    setDraftKey(groupsKey);
    setLocalGroups(groups);
  }
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [reorderState, reorderAction] = useActionState(reorderEstimateLineItemsAction, {} as ReorderActionState);
  const [, startTransition] = useTransition();

  function persistOrder(nextGroups: readonly SpreadsheetGroup[]) {
    if (!estimateId || !reorderable) return;
    const orderedIds = nextGroups.flatMap((group) => group.items.map((item) => item.id));
    const formData = new FormData();
    formData.set("estimateId", estimateId);
    if (proposalId) formData.set("proposalId", proposalId);
    formData.set("orderedIds", JSON.stringify(orderedIds));
    startTransition(() => {
      void reorderAction(formData);
    });
  }

  function moveItem(sourceId: string, targetId: string) {
    if (sourceId === targetId) return;
    const next = localGroups.map((group) => ({ ...group, items: [...group.items] }));
    let sourceGroup = -1;
    let sourceIndex = -1;
    let targetGroup = -1;
    let targetIndex = -1;
    for (let g = 0; g < next.length; g++) {
      const s = next[g].items.findIndex((item) => item.id === sourceId);
      if (s >= 0) {
        sourceGroup = g;
        sourceIndex = s;
      }
      const t = next[g].items.findIndex((item) => item.id === targetId);
      if (t >= 0) {
        targetGroup = g;
        targetIndex = t;
      }
    }
    if (sourceGroup < 0 || targetGroup < 0) return;
    if (sourceGroup !== targetGroup) return;
    const [moved] = next[sourceGroup].items.splice(sourceIndex, 1);
    next[sourceGroup].items.splice(targetIndex, 0, moved);
    next[sourceGroup] = {
      ...next[sourceGroup],
      groupClientTotalCents: next[sourceGroup].items.reduce((sum, row) => sum + row.clientTotalCents, 0),
    };
    setLocalGroups(next);
    persistOrder(next);
  }

  const displayGroups = reorderable ? localGroups : groups;
  const colCount = 5;

  return (
    <div className="flex flex-col gap-0">
      <div
        className="overflow-x-auto rounded-md border bg-[var(--bt-panel-bg)]"
        style={{ borderColor: "var(--bt-border)" }}
      >
        <table className="w-full min-w-[36rem] border-collapse text-left text-sm">
          <thead>
            <tr
              className="border-b text-[10px] font-semibold uppercase tracking-wide text-[var(--bt-muted)]"
              style={{ borderColor: "var(--bt-border)", background: "var(--bt-panel-bg-muted)" }}
            >
              <th className="px-2 py-1.5 font-semibold sm:px-2.5">Item</th>
              <th className="px-1.5 py-1.5 text-right font-semibold">Quantity</th>
              <th className="px-1.5 py-1.5 text-right font-semibold">Unit cost</th>
              <th className="hidden px-1.5 py-1.5 font-semibold sm:table-cell">Cost type</th>
              <th className="px-2 py-1.5 text-right font-semibold sm:px-2.5">Client total</th>
            </tr>
          </thead>
          <tbody>
            {displayGroups.length === 0 ? (
              <tr>
                <td colSpan={colCount} className="px-4 py-6 text-center text-sm text-[var(--bt-muted)]">
                  No line items on this estimate yet.
                </td>
              </tr>
            ) : null}
            {displayGroups.map((group, groupIndex) => (
              <GroupRows
                key={group.label}
                group={group}
                groupNumber={groupIndex + 1}
                showBreakdown={showBreakdown}
                reorderable={reorderable}
                draggingId={draggingId}
                onDragStart={setDraggingId}
                onDragEnd={() => setDraggingId(null)}
                onDropOn={moveItem}
              />
            ))}
          </tbody>
        </table>
      </div>

      {reorderState.error ? <p className="mt-1 text-xs text-red-600">{reorderState.error}</p> : null}

      <div
        className="sticky bottom-0 z-10 mt-1.5 flex flex-col gap-1 rounded-md border px-2.5 py-1.5 backdrop-blur-md sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:px-3"
        style={{
          borderColor: "var(--bt-border)",
          background: "color-mix(in srgb, var(--bt-panel-bg) 96%, transparent)",
          boxShadow: "0 -4px 12px color-mix(in srgb, var(--bt-text) 6%, transparent)",
        }}
      >
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[var(--bt-muted)]">
          <button
            type="button"
            onClick={() => setShowBreakdown((v) => !v)}
            className="rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide hover:bg-[var(--bt-panel-bg-muted)]"
            style={{ borderColor: "var(--bt-border)" }}
            aria-pressed={showBreakdown}
          >
            {showBreakdown ? "Hide line detail" : "Show line detail"}
          </button>
          <span>
            Profit margin{" "}
            <strong className="text-xs tabular-nums" style={{ color: "var(--bt-primary)" }}>
              {formatPercent(marginBasisPoints)}
            </strong>
          </span>
        </div>
        {/* Handoff always shows cost + markup + total in the sticky footer */}
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[11px] text-[var(--bt-muted)] sm:justify-end sm:text-xs">
          <span>
            Total cost{" "}
            <strong className="tabular-nums text-[var(--bt-text)]">{formatMoney(totalBuilderCostCents)}</strong>
          </span>
          <span aria-hidden>+</span>
          <span>
            Total markup{" "}
            <strong className="tabular-nums text-[var(--bt-text)]">{formatMoney(totalMarkupCents)}</strong>
          </span>
          <span aria-hidden>=</span>
          <span>
            Estimate total{" "}
            <strong className="text-sm tabular-nums text-[var(--bt-text)] sm:text-base">
              {formatMoney(totalClientCents)}
            </strong>
          </span>
        </div>
      </div>
    </div>
  );
}

function GroupRows({
  group,
  groupNumber,
  showBreakdown,
  reorderable,
  draggingId,
  onDragStart,
  onDragEnd,
  onDropOn,
}: {
  readonly group: SpreadsheetGroup;
  readonly groupNumber: number;
  readonly showBreakdown: boolean;
  readonly reorderable: boolean;
  readonly draggingId: string | null;
  readonly onDragStart: (id: string) => void;
  readonly onDragEnd: () => void;
  readonly onDropOn: (sourceId: string, targetId: string) => void;
}) {
  const [open, setOpen] = useState(true);
  return (
    <>
      <tr style={{ background: "var(--bt-panel-bg-muted)" }}>
        <td colSpan={5} className="px-2 py-1 sm:px-2.5">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="flex w-full min-h-8 touch-manipulation items-center justify-between gap-2 text-left sm:min-h-0"
            aria-expanded={open}
          >
            <span className="flex min-w-0 items-center gap-1.5 text-[11px] font-semibold text-[var(--bt-text)]">
              <span className="inline-block w-2.5 shrink-0 text-[9px] text-[var(--bt-muted)]" aria-hidden>
                {open ? "▾" : "▸"}
              </span>
              <span className="tabular-nums text-[var(--bt-muted)]">{groupNumber}</span>
              <span className="truncate">{group.label}</span>
              <span className="shrink-0 font-normal text-[var(--bt-muted)]">({group.items.length})</span>
            </span>
            <span className="shrink-0 text-[11px] font-semibold tabular-nums text-[var(--bt-text)]">
              {formatMoney(group.groupClientTotalCents)}
            </span>
          </button>
        </td>
      </tr>
      {open
        ? group.items.map((item, i) => {
            const typeStyle = COST_TYPE_STYLE[item.costType] ?? COST_TYPE_STYLE.NONE;
            const rowLabel = `${groupNumber}.${i + 1}`;
            const unit = resolveLineUnit(item.unit, item.costType);
            const isDragging = draggingId === item.id;
            return (
              <tr
                key={item.id}
                draggable={reorderable}
                onDragStart={(event) => {
                  if (!reorderable) return;
                  event.dataTransfer.setData("text/plain", item.id);
                  event.dataTransfer.effectAllowed = "move";
                  onDragStart(item.id);
                }}
                onDragEnd={onDragEnd}
                onDragOver={(event) => {
                  if (!reorderable || !draggingId) return;
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                }}
                onDrop={(event) => {
                  if (!reorderable) return;
                  event.preventDefault();
                  const sourceId = event.dataTransfer.getData("text/plain") || draggingId;
                  if (sourceId) onDropOn(sourceId, item.id);
                  onDragEnd();
                }}
                className={`border-t align-middle ${isDragging ? "opacity-50" : ""}`}
                style={{ borderColor: "var(--bt-border)" }}
              >
                <td className="px-2 py-1 sm:px-2.5">
                  <div className="flex items-start gap-1 sm:gap-1.5">
                    {reorderable ? <DragHandle /> : null}
                    <span className="mt-px w-6 shrink-0 text-[9px] tabular-nums text-[var(--bt-muted)] sm:w-7">
                      {rowLabel}
                    </span>
                    <div className="min-w-0">
                      <div className="text-[12px] font-medium leading-tight text-[var(--bt-text)]">{item.title}</div>
                      <div className="truncate text-[9px] leading-tight text-[var(--bt-muted)]">{item.costCodeLabel}</div>
                      {showBreakdown && item.description ? (
                        <p className="mt-0.5 line-clamp-1 text-[9px] leading-tight text-[var(--bt-muted)]">
                          {item.description}
                        </p>
                      ) : null}
                      {showBreakdown ? (
                        <p className="mt-0.5 text-[9px] tabular-nums text-[var(--bt-muted)]">
                          Cost {formatMoney(item.builderCostCents)} ·{" "}
                          {formatPercent(item.rateBasisPoints)}
                          {item.rateMode === "MARGIN" ? " mar" : " mk"}
                        </p>
                      ) : null}
                      <div className="mt-0.5 sm:hidden">
                        <span
                          className="inline-block rounded px-1 py-px text-[8px] font-semibold"
                          style={{ background: typeStyle.bg, color: typeStyle.text }}
                        >
                          {costTypeLabel(item.costType)}
                        </span>
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-1.5 py-1 text-right text-[11px] tabular-nums text-[var(--bt-text)]">
                  {formatQtyWithUnit(item.quantityMilli, unit)}
                </td>
                <td className="px-1.5 py-1 text-right text-[11px] tabular-nums text-[var(--bt-text)]">
                  {formatMoney(item.unitCostCents)}
                </td>
                <td className="hidden px-1.5 py-1 sm:table-cell">
                  <span
                    className="inline-block rounded px-1.5 py-px text-[9px] font-semibold"
                    style={{ background: typeStyle.bg, color: typeStyle.text }}
                  >
                    {costTypeLabel(item.costType)}
                  </span>
                </td>
                <td className="px-2 py-1 text-right text-[12px] font-medium tabular-nums text-[var(--bt-text)] sm:px-2.5">
                  {formatMoney(item.clientTotalCents)}
                </td>
              </tr>
            );
          })
        : null}
    </>
  );
}
