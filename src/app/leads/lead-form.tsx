"use client";

import { useActionState, useRef, useState } from "react";

import { createLeadAction, type ActionState } from "./actions";

const INITIAL: ActionState = {};

export function LeadForm() {
  const [state, formAction, pending] = useActionState(createLeadAction, INITIAL);
  const formRef = useRef<HTMLFormElement>(null);
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="self-start rounded px-4 py-2 text-sm font-semibold text-white"
        style={{ background: "var(--bt-primary)" }}
      >
        + Lead Opportunity
      </button>
    );
  }

  return (
    <form
      ref={formRef}
      action={async (formData) => {
        await formAction(formData);
        formRef.current?.reset();
        setOpen(false);
      }}
      className="flex flex-col gap-3 rounded-lg border bg-white p-4"
      style={{ borderColor: "var(--bt-border)" }}
    >
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-[var(--bt-text)]">Add lead opportunity</h2>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-[var(--bt-muted)] hover:underline">
          Cancel
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="grid gap-1 text-xs">
          <span className="font-medium text-[var(--bt-muted)]">Title / name</span>
          <input
            name="name"
            required
            placeholder="Jane Homeowner"
            className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]"
            style={{ borderColor: "var(--bt-border)" }}
          />
        </label>
        <label className="grid gap-1 text-xs">
          <span className="font-medium text-[var(--bt-muted)]">Email</span>
          <input
            name="email"
            type="email"
            className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]"
            style={{ borderColor: "var(--bt-border)" }}
          />
        </label>
        <label className="grid gap-1 text-xs">
          <span className="font-medium text-[var(--bt-muted)]">Phone</span>
          <input
            name="phone"
            className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]"
            style={{ borderColor: "var(--bt-border)" }}
          />
        </label>
        <label className="grid gap-1 text-xs">
          <span className="font-medium text-[var(--bt-muted)]">Source</span>
          <input
            name="source"
            placeholder="Referral"
            className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]"
            style={{ borderColor: "var(--bt-border)" }}
          />
        </label>
        <label className="grid gap-1 text-xs">
          <span className="font-medium text-[var(--bt-muted)]">Project type</span>
          <input
            name="projectType"
            placeholder="Kitchen Remodel"
            className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]"
            style={{ borderColor: "var(--bt-border)" }}
          />
        </label>
        <label className="grid gap-1 text-xs">
          <span className="font-medium text-[var(--bt-muted)]">Tags</span>
          <input
            name="tags"
            placeholder="comma, separated"
            className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]"
            style={{ borderColor: "var(--bt-border)" }}
          />
        </label>
        <label className="grid gap-1 text-xs">
          <span className="font-medium text-[var(--bt-muted)]">Confidence %</span>
          <input
            name="confidencePercent"
            type="number"
            min={0}
            max={100}
            defaultValue={0}
            className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]"
            style={{ borderColor: "var(--bt-border)" }}
          />
        </label>
        <label className="grid gap-1 text-xs">
          <span className="font-medium text-[var(--bt-muted)]">Projected sales date</span>
          <input
            name="projectedSalesDate"
            type="date"
            className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]"
            style={{ borderColor: "var(--bt-border)" }}
          />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="grid gap-1 text-xs">
            <span className="font-medium text-[var(--bt-muted)]">Est. revenue min</span>
            <input
              name="estimatedRevenueMin"
              inputMode="decimal"
              placeholder="0.00"
              className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]"
              style={{ borderColor: "var(--bt-border)" }}
            />
          </label>
          <label className="grid gap-1 text-xs">
            <span className="font-medium text-[var(--bt-muted)]">Est. revenue max</span>
            <input
              name="estimatedRevenueMax"
              inputMode="decimal"
              placeholder="0.00"
              className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]"
              style={{ borderColor: "var(--bt-border)" }}
            />
          </label>
        </div>
      </div>

      {state.error ? <p className="text-xs text-red-600">{state.error}</p> : null}

      <div>
        <button
          type="submit"
          disabled={pending}
          className="rounded px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          style={{ background: "var(--bt-primary)" }}
        >
          {pending ? "Adding…" : "Save"}
        </button>
      </div>
    </form>
  );
}
