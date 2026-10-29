"use client";

import { useActionState } from "react";

import type { PermitTrade } from "@/generated/prisma/enums";
import { tradeLabel } from "@/lib/permitting/labels";

import { addJobPermitAction, type ActionState } from "./actions";

const INITIAL: ActionState = {};

export function AddPermitForm({
  jobId,
  trades,
}: {
  jobId: string;
  trades: readonly PermitTrade[];
}) {
  const [state, formAction, pending] = useActionState(addJobPermitAction, INITIAL);

  return (
    <form action={formAction} className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <input type="hidden" name="jobId" value={jobId} />
      <select
        name="trade"
        required
        defaultValue=""
        className="w-full min-w-0 flex-1 rounded border bg-white px-2.5 py-2 text-xs outline-none focus:border-[var(--bt-primary)] sm:py-1.5"
        style={{ borderColor: "var(--bt-border)" }}
        aria-label="Permit trade to add"
      >
        <option value="" disabled>
          Select permit type…
        </option>
        {trades.map((trade) => (
          <option key={trade} value={trade}>
            {tradeLabel(trade)}
          </option>
        ))}
      </select>
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded px-3 py-2.5 text-xs font-semibold text-[var(--bt-on-primary)] disabled:opacity-50 sm:w-auto sm:py-1.5"
        style={{ background: "var(--bt-primary)" }}
      >
        {pending ? "Adding…" : "Add permit"}
      </button>
      {state.error ? <p className="text-xs text-red-600 sm:basis-full">{state.error}</p> : null}
    </form>
  );
}
