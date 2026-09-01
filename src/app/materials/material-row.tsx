"use client";

import { useActionState, useState } from "react";

import { formatDate, formatMoney } from "@/lib/format";

import { deleteMaterialCatalogItemAction, updateMaterialCatalogItemAction, type ActionState } from "./actions";

const INITIAL: ActionState = {};

const VENDOR_LABEL: Record<string, string> = {
  LOWES: "Lowe's",
  HOME_DEPOT: "Home Depot",
  OTHER: "Other",
};

export interface MaterialRowData {
  readonly id: string;
  readonly vendor: string;
  readonly sku: string | null;
  readonly description: string;
  readonly unit: string;
  readonly unitCostCents: number;
  readonly category: string | null;
  readonly source: string;
  readonly sourceUrl: string | null;
  readonly verifiedAt: Date | null;
}

export function MaterialRow({ item }: { item: MaterialRowData }) {
  const [editing, setEditing] = useState(false);
  const [state, formAction, pending] = useActionState(updateMaterialCatalogItemAction, INITIAL);

  if (editing) {
    return (
      <tr className="border-b last:border-0" style={{ borderColor: "var(--bt-border)" }}>
        <td colSpan={6} className="px-4 py-3">
          <form action={formAction} className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="itemId" value={item.id} />
            <input name="description" defaultValue={item.description} required className="min-w-[10rem] flex-1 rounded border px-2 py-1 text-sm outline-none focus:border-[var(--bt-primary)]" style={{ borderColor: "var(--bt-border)" }} />
            <input name="unit" defaultValue={item.unit} required className="w-20 rounded border px-2 py-1 text-sm outline-none focus:border-[var(--bt-primary)]" style={{ borderColor: "var(--bt-border)" }} />
            <input name="unitCost" defaultValue={(item.unitCostCents / 100).toFixed(2)} inputMode="decimal" required className="w-24 rounded border px-2 py-1 text-sm outline-none focus:border-[var(--bt-primary)]" style={{ borderColor: "var(--bt-border)" }} />
            <button type="submit" disabled={pending} className="rounded px-2 py-1 text-xs font-semibold text-[var(--bt-on-primary)] disabled:opacity-50" style={{ background: "var(--bt-primary)" }}>
              {pending ? "Saving…" : "Save"}
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
    <tr className="border-b last:border-0" style={{ borderColor: "var(--bt-border)" }}>
      <td className="px-4 py-3 text-[var(--bt-muted)]">{VENDOR_LABEL[item.vendor] ?? item.vendor}</td>
      <td className="px-4 py-3 font-medium text-[var(--bt-text)]">
        {item.description}
        {item.sku ? <span className="ml-2 text-xs text-[var(--bt-muted)]">SKU {item.sku}</span> : null}
      </td>
      <td className="px-4 py-3 text-[var(--bt-muted)]">{item.category ?? "—"}</td>
      <td className="px-4 py-3 text-[var(--bt-text)]">
        {formatMoney(item.unitCostCents)} / {item.unit}
      </td>
      <td className="px-4 py-3 text-xs text-[var(--bt-muted)]">
        {item.source === "WEB_SEARCH" ? (
          <span>
            Web-sourced, unverified
            {item.sourceUrl ? (
              <>
                {" — "}
                <a href={item.sourceUrl} target="_blank" rel="noreferrer" className="text-[var(--bt-primary)] hover:underline">
                  source
                </a>
              </>
            ) : null}
          </span>
        ) : (
          <span>Verified {formatDate(item.verifiedAt)}</span>
        )}
      </td>
      <td className="px-4 py-3">
        <div className="flex gap-2">
          <button type="button" onClick={() => setEditing(true)} className="text-xs font-medium text-[var(--bt-primary)] hover:underline">
            Edit
          </button>
          <form action={deleteMaterialCatalogItemAction}>
            <input type="hidden" name="itemId" value={item.id} />
            <button type="submit" className="text-xs text-[var(--bt-muted)] hover:text-red-600 hover:underline">
              Delete
            </button>
          </form>
        </div>
      </td>
    </tr>
  );
}
