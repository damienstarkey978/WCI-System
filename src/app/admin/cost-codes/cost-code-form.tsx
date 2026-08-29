"use client";

import { useActionState } from "react";

import { CostType } from "@/generated/prisma/enums";
import { createCostCodeAction, type ActionState } from "./actions";

const INITIAL: ActionState = {};

const inputClass =
  "w-full rounded border border-black/15 bg-[var(--bt-panel-bg)] px-3 py-2 text-sm outline-none focus:border-black/40 dark:border-white/20 dark:bg-black/30 dark:focus:border-white/50";

export function CreateCostCodeForm() {
  const [state, formAction, pending] = useActionState(createCostCodeAction, INITIAL);

  return (
    <form action={formAction} className="grid gap-3 rounded-lg border border-black/10 p-4 dark:border-white/15">
      <h2 className="text-sm font-semibold">New cost code</h2>

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="grid gap-1 text-xs">
          <span className="text-black/60 dark:text-white/60">Code *</span>
          <input name="code" required className={inputClass} placeholder="PAINT-EXT-L" />
        </label>

        <label className="grid gap-1 text-xs">
          <span className="text-black/60 dark:text-white/60">Name *</span>
          <input name="name" required className={inputClass} placeholder="Ext Paint Labor" />
        </label>

        <label className="grid gap-1 text-xs">
          <span className="text-black/60 dark:text-white/60">Default cost type</span>
          <select name="defaultCostType" defaultValue={CostType.NONE} className={inputClass}>
            {Object.values(CostType).map((costType) => (
              <option key={costType} value={costType}>
                {costType}
              </option>
            ))}
          </select>
        </label>
      </div>

      {state.error ? (
        <p role="alert" className="text-xs text-red-600 dark:text-red-400">
          {state.error}
        </p>
      ) : null}

      <div>
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-black px-3 py-2 text-xs font-medium text-white disabled:opacity-50 dark:bg-[var(--bt-panel-bg)] dark:text-black"
        >
          {pending ? "Adding…" : "Add cost code"}
        </button>
      </div>
    </form>
  );
}
