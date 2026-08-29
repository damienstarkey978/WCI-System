"use client";

import { useActionState, useRef } from "react";

import { searchWebPriceAction, type ActionState } from "./actions";

const INITIAL: ActionState = {};

/**
 * The web-search fallback: no Lowe's/Home Depot pricing API exists yet, so this
 * asks Claude to search the open web for a current price and saves it as an
 * unverified, web-sourced catalog entry (same "flagged for human review" status
 * as any other WEB_SEARCH row) rather than acting as a live, trusted price feed.
 */
export function SearchWebPriceForm() {
  const [state, formAction, pending] = useActionState(searchWebPriceAction, INITIAL);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      action={async (formData) => {
        await formAction(formData);
        formRef.current?.reset();
      }}
      className="rounded-lg border border-dashed bg-[var(--bt-panel-bg)] p-4"
      style={{ borderColor: "var(--bt-border)" }}
    >
      <h2 className="text-sm font-semibold text-[var(--bt-text)]">Search the web for a price</h2>
      <p className="mt-1 text-xs text-[var(--bt-muted)]">
        No item in the catalog yet? Have Claude search the open web for a current price — it&apos;s saved here as
        unverified until you check it, same as anything else it finds while drafting an estimate.
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-6">
        <label className="grid gap-1 text-sm sm:col-span-3">
          <span className="text-xs font-medium text-[var(--bt-muted)]">What are you looking for?</span>
          <input
            name="description"
            required
            placeholder='e.g. "2x6x8 SPF stud"'
            className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]"
            style={{ borderColor: "var(--bt-border)" }}
          />
        </label>
        <label className="grid gap-1 text-sm sm:col-span-2">
          <span className="text-xs font-medium text-[var(--bt-muted)]">Category</span>
          <input
            name="category"
            placeholder="Framing, Roofing…"
            className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]"
            style={{ borderColor: "var(--bt-border)" }}
          />
        </label>
      </div>
      {state.error ? (
        <p role="alert" className="mt-2 text-xs text-red-600">
          {state.error}
        </p>
      ) : null}
      <div className="mt-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded border px-4 py-2 text-sm font-semibold text-[var(--bt-text)] disabled:opacity-50"
          style={{ borderColor: "var(--bt-border)" }}
        >
          {pending ? "Searching the web…" : "Search the web"}
        </button>
      </div>
    </form>
  );
}
