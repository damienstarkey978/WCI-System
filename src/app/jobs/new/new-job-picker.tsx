"use client";

import { useActionState, useState } from "react";

import { ContractType } from "@/generated/prisma/enums";

import { createJobFromScratchAction, type ActionState } from "./actions";

const INITIAL: ActionState = {};

const inputClass = "w-full rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]";
const inputStyle = { borderColor: "var(--bt-border)" };

function PickerCard({
  title,
  description,
  disabled,
  onClick,
}: {
  title: string;
  description: string;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex flex-col gap-1 rounded-lg border p-4 text-left disabled:cursor-not-allowed disabled:opacity-50"
      style={{ borderColor: "var(--bt-border)" }}
    >
      <span className="text-sm font-semibold text-[var(--bt-text)]">{title}</span>
      <span className="text-xs text-[var(--bt-muted)]">{description}</span>
    </button>
  );
}

export function NewJobPicker() {
  const [mode, setMode] = useState<"pick" | "scratch">("pick");
  const [state, formAction, pending] = useActionState(createJobFromScratchAction, INITIAL);

  if (mode === "pick") {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-xl font-semibold text-[var(--bt-text)]">New job</h1>
        <p className="text-sm text-[var(--bt-muted)]">How would you like to set up your new job?</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <PickerCard title="From scratch" description="Start with a blank job and fill in details yourself." onClick={() => setMode("scratch")} />
          <PickerCard title="From a template" description="Coming soon — clone a working template job." disabled />
          <PickerCard title="Recommended templates" description="Coming soon — pick from suggested starting points." disabled />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <button type="button" onClick={() => setMode("pick")} className="text-sm text-[var(--bt-primary)] hover:underline">
          ← Back
        </button>
        <h1 className="mt-1 text-xl font-semibold text-[var(--bt-text)]">New job from scratch</h1>
        <p className="text-sm text-[var(--bt-muted)]">
          Just the essentials to get started — you&apos;ll land on the job&apos;s settings to fill in the rest (address, schedule, clients, internal
          users, subs/vendors).
        </p>
      </div>

      <form action={formAction} className="grid gap-4 rounded-lg border bg-[var(--bt-panel-bg)] p-4 sm:grid-cols-2" style={inputStyle}>
        <label className="grid gap-1 text-sm sm:col-span-2">
          <span className="text-xs font-medium text-[var(--bt-muted)]">Job title *</span>
          <input name="name" required autoFocus placeholder="283 Red Cedar Dr - Smith - Addition" className={inputClass} style={inputStyle} />
        </label>

        <label className="grid gap-1 text-sm">
          <span className="text-xs font-medium text-[var(--bt-muted)]">Type</span>
          <input name="jobType" placeholder="Addition, Remodel, New Construction…" className={inputClass} style={inputStyle} />
        </label>

        <div className="grid gap-1 text-sm">
          <span className="text-xs font-medium text-[var(--bt-muted)]">Contract type *</span>
          <div className="flex flex-col gap-2">
            <label className="flex items-start gap-2 text-xs text-[var(--bt-text)]">
              <input type="radio" name="contractType" value={ContractType.FIXED_PRICE} defaultChecked className="mt-0.5" />
              <span>
                <span className="font-medium">Fixed price</span> — you set the contract price for the client
              </span>
            </label>
            <label className="flex items-start gap-2 text-xs text-[var(--bt-text)]">
              <input type="radio" name="contractType" value={ContractType.OPEN_BOOK} className="mt-0.5" />
              <span>
                <span className="font-medium">Open book</span> — price = projected costs + markup
              </span>
            </label>
          </div>
        </div>

        <div className="flex items-center gap-3 sm:col-span-2">
          <button
            type="submit"
            disabled={pending}
            className="rounded px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            style={{ background: "var(--bt-primary)" }}
          >
            {pending ? "Creating…" : "Create job"}
          </button>
          {state.error ? (
            <p role="alert" className="text-xs text-red-600">
              {state.error}
            </p>
          ) : null}
        </div>
      </form>
    </div>
  );
}
