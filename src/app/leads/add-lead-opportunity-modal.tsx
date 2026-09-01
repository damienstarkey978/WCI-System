"use client";

/**
 * Buildertrend-match "Add Lead Opportunity" — a real popup dialog (not an inline
 * expanding form), matching the reference screenshots: a persistent "Contact
 * information" section above three tabs (General / Activities / Proposals).
 *
 * Activities and Proposals are inert previews here, same as Buildertrend's own
 * modal — there's no Lead id yet to attach a real LeadActivity or Proposal to
 * until this is saved, so both tabs just show the same empty-state copy the
 * reference screenshots show, with no functioning controls.
 */

import { useActionState, useRef, useState } from "react";

import { createLeadAction, type ActionState } from "./actions";

const INITIAL: ActionState = {};

export interface ExistingContactOption {
  readonly id: string;
  readonly name: string;
  readonly email: string;
}

type ContactMode = "none" | "choose" | "new";

const TABS = [
  { value: "general", label: "General" },
  { value: "activities", label: "Activities" },
  { value: "proposals", label: "Proposals" },
] as const;

export function AddLeadOpportunityModal({ clients }: { clients: readonly ExistingContactOption[] }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<(typeof TABS)[number]["value"]>("general");
  const [contactMode, setContactMode] = useState<ContactMode>("none");
  const [chosenClientId, setChosenClientId] = useState("");
  const [state, formAction, pending] = useActionState(createLeadAction, INITIAL);
  const formRef = useRef<HTMLFormElement>(null);

  const chosenClient = clients.find((client) => client.id === chosenClientId);

  function close() {
    setOpen(false);
    setTab("general");
    setContactMode("none");
    setChosenClientId("");
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="self-start rounded px-4 py-2 text-sm font-semibold text-[var(--bt-on-primary)]"
        style={{ background: "var(--bt-primary)" }}
      >
        + Lead Opportunity
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg bg-[var(--bt-panel-bg)] shadow-2xl">
        <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: "var(--bt-border)" }}>
          <h2 className="text-lg font-semibold text-[var(--bt-text)]">Add Lead Opportunity</h2>
          <button type="button" onClick={close} aria-label="Close" className="text-xl text-[var(--bt-muted)] hover:text-[var(--bt-text)]">
            ✕
          </button>
        </div>

        <form
          ref={formRef}
          action={async (formData) => {
            await formAction(formData);
            if (!state.error) close();
          }}
          className="flex flex-1 flex-col overflow-y-auto"
        >
          {chosenClient ? <input type="hidden" name="contactClientId" value={chosenClient.id} /> : null}

          {/* Contact information — persistent above the tabs, same as the reference modal */}
          <div className="border-b p-5" style={{ borderColor: "var(--bt-border)" }}>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--bt-muted)]">Contact information</h3>

            {contactMode === "none" ? (
              <div className="mt-3 flex flex-col items-center gap-2 py-4 text-center">
                <span className="text-3xl">🏠</span>
                <div className="text-sm font-semibold text-[var(--bt-text)]">Add a client contact</div>
                <p className="max-w-sm text-xs text-[var(--bt-muted)]">
                  Store your client&apos;s contact information so you can quickly add them to jobs.
                </p>
                <div className="mt-1 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setContactMode("choose")}
                    className="rounded border px-3 py-1.5 text-xs font-medium text-[var(--bt-text)]"
                    style={{ borderColor: "var(--bt-border)" }}
                  >
                    Choose from existing contacts
                  </button>
                  <button
                    type="button"
                    onClick={() => setContactMode("new")}
                    className="rounded px-3 py-1.5 text-xs font-semibold text-[var(--bt-on-primary)]"
                    style={{ background: "var(--bt-primary)" }}
                  >
                    + Contact
                  </button>
                </div>
              </div>
            ) : contactMode === "choose" ? (
              <div className="mt-3 flex flex-col gap-2">
                <select
                  value={chosenClientId}
                  onChange={(event) => setChosenClientId(event.target.value)}
                  className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]"
                  style={{ borderColor: "var(--bt-border)" }}
                >
                  <option value="">Select a contact…</option>
                  {clients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.name} ({client.email})
                    </option>
                  ))}
                </select>
                {chosenClient ? (
                  <>
                    <input type="hidden" name="name" value={chosenClient.name} />
                    <input type="hidden" name="email" value={chosenClient.email} />
                  </>
                ) : null}
                <button type="button" onClick={() => { setContactMode("none"); setChosenClientId(""); }} className="self-start text-xs text-[var(--bt-muted)] hover:underline">
                  Cancel
                </button>
              </div>
            ) : (
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                <label className="grid gap-1 text-xs">
                  <span className="font-medium text-[var(--bt-muted)]">Name</span>
                  <input name="name" placeholder="Jane Homeowner" className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]" style={{ borderColor: "var(--bt-border)" }} />
                </label>
                <label className="grid gap-1 text-xs">
                  <span className="font-medium text-[var(--bt-muted)]">Email</span>
                  <input name="email" type="email" className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]" style={{ borderColor: "var(--bt-border)" }} />
                </label>
                <label className="grid gap-1 text-xs">
                  <span className="font-medium text-[var(--bt-muted)]">Phone</span>
                  <input name="phone" className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]" style={{ borderColor: "var(--bt-border)" }} />
                </label>
                <button type="button" onClick={() => setContactMode("none")} className="self-start text-xs text-[var(--bt-muted)] hover:underline sm:col-span-3">
                  Remove contact
                </button>
              </div>
            )}
          </div>

          {/* Tabs */}
          <nav className="flex gap-1 overflow-x-auto border-b px-5 text-sm font-medium" style={{ borderColor: "var(--bt-border)" }}>
            {TABS.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setTab(t.value)}
                className="shrink-0 border-b-2 px-3 py-2.5 whitespace-nowrap"
                style={tab === t.value ? { borderColor: "var(--bt-active-bar)", color: "var(--bt-text)" } : { borderColor: "transparent", color: "var(--bt-muted)" }}
              >
                {t.label}
              </button>
            ))}
          </nav>

          <div className="flex-1 p-5">
            {tab === "general" ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1 text-xs sm:col-span-2">
                  <span className="font-medium text-[var(--bt-muted)]">
                    Title <span className="text-red-600">*</span>
                  </span>
                  <input
                    name="title"
                    required
                    placeholder="123 Main St - Jane Homeowner"
                    className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]"
                    style={{ borderColor: "var(--bt-border)" }}
                  />
                </label>

                <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--bt-muted)] sm:col-span-2">Address</h4>
                <label className="grid gap-1 text-xs sm:col-span-2">
                  <span className="font-medium text-[var(--bt-muted)]">Street address</span>
                  <input name="addressLine1" className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]" style={{ borderColor: "var(--bt-border)" }} />
                </label>
                <label className="grid gap-1 text-xs">
                  <span className="font-medium text-[var(--bt-muted)]">City</span>
                  <input name="city" className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]" style={{ borderColor: "var(--bt-border)" }} />
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="grid gap-1 text-xs">
                    <span className="font-medium text-[var(--bt-muted)]">State</span>
                    <input name="state" className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]" style={{ borderColor: "var(--bt-border)" }} />
                  </label>
                  <label className="grid gap-1 text-xs">
                    <span className="font-medium text-[var(--bt-muted)]">Zip code</span>
                    <input name="postalCode" className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]" style={{ borderColor: "var(--bt-border)" }} />
                  </label>
                </div>

                <label className="grid gap-1 text-xs">
                  <span className="font-medium text-[var(--bt-muted)]">Confidence %</span>
                  <input name="confidencePercent" type="number" min={0} max={100} defaultValue={0} className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]" style={{ borderColor: "var(--bt-border)" }} />
                </label>
                <label className="grid gap-1 text-xs">
                  <span className="font-medium text-[var(--bt-muted)]">Projected sales date</span>
                  <input name="projectedSalesDate" type="date" className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]" style={{ borderColor: "var(--bt-border)" }} />
                </label>

                <label className="grid gap-1 text-xs">
                  <span className="font-medium text-[var(--bt-muted)]">Est. revenue min</span>
                  <input name="estimatedRevenueMin" inputMode="decimal" placeholder="0.00" className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]" style={{ borderColor: "var(--bt-border)" }} />
                </label>
                <label className="grid gap-1 text-xs">
                  <span className="font-medium text-[var(--bt-muted)]">Est. revenue max</span>
                  <input name="estimatedRevenueMax" inputMode="decimal" placeholder="0.00" className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]" style={{ borderColor: "var(--bt-border)" }} />
                </label>

                <label className="grid gap-1 text-xs">
                  <span className="font-medium text-[var(--bt-muted)]">Source</span>
                  <input name="source" placeholder="Referral" className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]" style={{ borderColor: "var(--bt-border)" }} />
                </label>
                <label className="grid gap-1 text-xs">
                  <span className="font-medium text-[var(--bt-muted)]">Project type</span>
                  <input name="projectType" placeholder="Kitchen Remodel" className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]" style={{ borderColor: "var(--bt-border)" }} />
                </label>
                <label className="grid gap-1 text-xs sm:col-span-2">
                  <span className="font-medium text-[var(--bt-muted)]">Tags</span>
                  <input name="tags" placeholder="comma, separated" className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]" style={{ borderColor: "var(--bt-border)" }} />
                </label>

                <label className="grid gap-1 text-xs sm:col-span-2">
                  <span className="font-medium text-[var(--bt-muted)]">Notes</span>
                  <textarea name="notes" rows={3} className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]" style={{ borderColor: "var(--bt-border)" }} />
                </label>
              </div>
            ) : tab === "activities" ? (
              <div className="flex flex-col items-center gap-2 py-10 text-center">
                <span className="text-3xl">📞</span>
                <div className="text-sm font-semibold text-[var(--bt-text)]">Add a Lead Activity</div>
                <p className="max-w-sm text-xs text-[var(--bt-muted)]">
                  Log calls and appointments with your potential clients. Save this lead opportunity first to add activities.
                </p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 py-10 text-center">
                <span className="text-3xl">📄</span>
                <div className="text-sm font-semibold text-[var(--bt-text)]">Build a more powerful proposal</div>
                <p className="max-w-sm text-xs text-[var(--bt-muted)]">
                  Save this lead opportunity first, then use Estimates and AI drafting to build a proposal.
                </p>
              </div>
            )}
          </div>

          {state.error ? <p className="px-5 pb-2 text-xs text-red-600">{state.error}</p> : null}

          <div className="flex justify-end gap-2 border-t p-4" style={{ borderColor: "var(--bt-border)" }}>
            <button type="button" onClick={close} className="rounded border px-4 py-2 text-sm font-medium text-[var(--bt-text)]" style={{ borderColor: "var(--bt-border)" }}>
              Cancel
            </button>
            <button type="submit" disabled={pending} className="rounded px-4 py-2 text-sm font-semibold text-[var(--bt-on-primary)] disabled:opacity-50" style={{ background: "var(--bt-primary)" }}>
              {pending ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
