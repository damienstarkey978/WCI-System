"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import { formatMoney } from "@/lib/format";

import { addOptionAction, removeOptionAction, updateOptionLabelAction, type ActionState } from "./actions";

const INITIAL: ActionState = {};

export interface OptionTabData {
  readonly id: string;
  readonly label: string;
  readonly totalCents: number;
}

export function OptionTabs({
  proposalId,
  options,
  activeOptionId,
  editable,
  maxOptions,
}: {
  proposalId: string;
  options: readonly OptionTabData[];
  activeOptionId: string;
  editable: boolean;
  maxOptions: number;
}) {
  const [renaming, setRenaming] = useState(false);
  const [labelState, labelAction, labelPending] = useActionState(updateOptionLabelAction, INITIAL);
  const [addState, addAction, addPending] = useActionState(addOptionAction, INITIAL);

  const active = options.find((option) => option.id === activeOptionId) ?? options[0];

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1 border-b" style={{ borderColor: "var(--bt-border)" }}>
        {options.map((option) => {
          const isActive = option.id === active.id;
          return (
            <Link
              key={option.id}
              href={`?option=${option.id}`}
              className="rounded-t px-3 py-1.5 text-xs font-medium"
              style={{
                background: isActive ? "var(--bt-panel-bg)" : "transparent",
                color: isActive ? "var(--bt-primary)" : "var(--bt-muted)",
                borderBottom: isActive ? "2px solid var(--bt-primary)" : "2px solid transparent",
              }}
            >
              {option.label} · {formatMoney(option.totalCents)}
            </Link>
          );
        })}
      </div>

      {editable ? (
        <div className="flex flex-wrap items-center gap-3">
          {renaming ? (
            <form action={labelAction} className="flex items-center gap-2">
              <input type="hidden" name="proposalId" value={proposalId} />
              <input type="hidden" name="optionId" value={active.id} />
              <input
                name="label"
                defaultValue={active.label}
                className="rounded border px-2 py-1 text-xs outline-none focus:border-[var(--bt-primary)]"
                style={{ borderColor: "var(--bt-border)" }}
              />
              <button type="submit" disabled={labelPending} className="text-xs font-semibold text-[var(--bt-primary)]">
                {labelPending ? "…" : "Save"}
              </button>
              <button type="button" onClick={() => setRenaming(false)} className="text-xs text-[var(--bt-muted)] hover:underline">
                Cancel
              </button>
            </form>
          ) : (
            <button type="button" onClick={() => setRenaming(true)} className="text-xs text-[var(--bt-primary)] hover:underline">
              Rename &quot;{active.label}&quot;
            </button>
          )}
          {labelState.error ? <span className="text-xs text-red-600">{labelState.error}</span> : null}

          {options.length > 1 ? (
            <form action={removeOptionAction}>
              <input type="hidden" name="proposalId" value={proposalId} />
              <input type="hidden" name="optionId" value={active.id} />
              <button type="submit" className="text-xs text-[var(--bt-muted)] hover:text-red-600 hover:underline">
                Remove this option
              </button>
            </form>
          ) : null}

          {options.length < maxOptions ? (
            <form action={addAction} className="flex items-center gap-2">
              <input type="hidden" name="proposalId" value={proposalId} />
              <input
                name="label"
                placeholder="New option label, e.g. Better"
                className="w-40 rounded border px-2 py-1 text-xs outline-none focus:border-[var(--bt-primary)]"
                style={{ borderColor: "var(--bt-border)" }}
              />
              <button type="submit" disabled={addPending} className="rounded border px-2 py-1 text-xs font-medium text-[var(--bt-text)]" style={{ borderColor: "var(--bt-border)" }}>
                {addPending ? "…" : "+ Add option"}
              </button>
              {addState.error ? <span className="text-xs text-red-600">{addState.error}</span> : null}
            </form>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
