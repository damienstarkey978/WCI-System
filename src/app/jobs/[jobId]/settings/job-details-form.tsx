"use client";

import Link from "next/link";
import { useActionState, type ReactNode } from "react";

import { ContractType } from "@/generated/prisma/enums";
import type { JobGroupModel, JobModel } from "@/generated/prisma/models";

import { updateJobDetailsAction, type ActionState } from "./actions";

/** Mirrors src/lib/jobs.ts's getJobType — duplicated rather than imported, since that
 *  module pulls in server-only Prisma code this client component must not bundle. */
function readJobType(customFields: JobModel["customFields"]): string {
  if (typeof customFields !== "object" || customFields === null || Array.isArray(customFields)) return "";
  const value = (customFields as Record<string, unknown>).jobType;
  return typeof value === "string" ? value : "";
}

const INITIAL: ActionState = {};

const inputClass =
  "w-full rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]";
const inputStyle = { borderColor: "var(--bt-border)" };

function toDateInputValue(date: Date | null): string {
  return date ? date.toISOString().slice(0, 10) : "";
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="text-xs font-medium text-[var(--bt-muted)]">{label}</span>
      {children}
    </label>
  );
}

function Card({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="rounded-lg border bg-[var(--bt-panel-bg)] p-5" style={inputStyle}>
      <div className="mb-4 flex items-start justify-between gap-2">
        <h2 className="text-base font-semibold text-[var(--bt-text)]">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export interface JobDetailsExtras {
  /** Rendered in place of Status: the job's current status plus a control to change it. */
  readonly statusControl: ReactNode;
  readonly contractPriceLabel: string;
  readonly relatedLead: { id: string; title: string; stageLabel: string } | null;
  readonly jobTypeSuggestions: readonly string[];
  readonly projectManagers: readonly { id: string; name: string }[];
  readonly customFields: readonly { id: string; name: string; type: "TEXT" | "CHECKBOX"; value: string | boolean | null }[];
  readonly addCustomFieldControl: ReactNode;
  readonly quickbooks: { linked: boolean; clientName: string | null };
}

export const JOB_DETAILS_FORM_ID = "job-details-form";

export function JobDetailsForm({ job, jobGroups, extras }: { job: JobModel; jobGroups: readonly JobGroupModel[]; extras: JobDetailsExtras }) {
  const action = updateJobDetailsAction.bind(null, job.id);
  const [state, formAction] = useActionState(action, INITIAL);

  return (
    <>
    <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      {/* The title input and the Save button live in the page header and join this form by id. */}
      <form id={JOB_DETAILS_FORM_ID} action={formAction} className="contents">
        <div className="flex flex-col gap-4">
          <Card
            title="Job information"
            action={
              extras.relatedLead ? (
                <Link href={`/leads/${extras.relatedLead.id}`} className="rounded border px-3 py-1.5 text-sm font-medium text-[var(--bt-text)]" style={inputStyle}>
                  View related Lead
                </Link>
              ) : null
            }
          >
            <div className="grid gap-4">
              <div className="max-w-xs">
                <Field label="Prefix">
                  <input name="prefix" defaultValue={job.prefix ?? ""} className={inputClass} style={inputStyle} />
                </Field>
              </div>

              <div className="flex flex-wrap items-start gap-6">
                <div className="grid gap-1 text-sm">
                  <span className="text-xs font-medium text-[var(--bt-muted)]">Status</span>
                  {extras.statusControl}
                </div>
                {extras.relatedLead ? (
                  <div className="grid gap-1 text-sm">
                    <span className="text-xs font-medium text-[var(--bt-muted)]">Related Lead status</span>
                    <span className="w-fit rounded px-2 py-0.5 text-xs font-semibold" style={{ background: "var(--bt-status-open-bg)", color: "var(--bt-status-open-text)" }}>
                      {extras.relatedLead.stageLabel}
                    </span>
                    <span className="max-w-xs text-sm text-[var(--bt-text)]">{extras.relatedLead.title}</span>
                  </div>
                ) : null}
              </div>

              <Field label="Contract price">
                <div className="rounded border px-3 py-2 text-sm text-[var(--bt-text)]" style={{ ...inputStyle, background: "var(--bt-panel-bg-muted)" }}>
                  {extras.contractPriceLabel}
                  <span className="ml-2 text-xs text-[var(--bt-muted)]">from the approved proposal</span>
                </div>
              </Field>

              <Field label="Type *">
                <input name="jobType" list="job-type-options" defaultValue={readJobType(job.customFields)} placeholder="Renovation, Addition, New Construction…" className={inputClass} style={inputStyle} />
                <datalist id="job-type-options">
                  {extras.jobTypeSuggestions.map((type) => (
                    <option key={type} value={type} />
                  ))}
                </datalist>
              </Field>

              <fieldset className="grid gap-2 text-sm">
                <legend className="mb-1 text-xs font-medium text-[var(--bt-muted)]">Contract type *</legend>
                <label className="flex cursor-pointer items-start gap-2">
                  <input type="radio" name="contractType" value={ContractType.FIXED_PRICE} defaultChecked={job.contractType === ContractType.FIXED_PRICE} className="mt-1" />
                  <span>
                    <span className="font-semibold text-[var(--bt-text)]">Fixed price</span>
                    <span className="block text-xs text-[var(--bt-muted)]">You will set the contract price for the client</span>
                  </span>
                </label>
                <label className="flex cursor-pointer items-start gap-2">
                  <input type="radio" name="contractType" value={ContractType.OPEN_BOOK} defaultChecked={job.contractType === ContractType.OPEN_BOOK} className="mt-1" />
                  <span>
                    <span className="font-semibold text-[var(--bt-text)]">Open book</span>
                    <span className="block text-xs text-[var(--bt-muted)]">
                      Price = projected costs + markup. &quot;Cost plus&quot; and &quot;time and materials&quot; contracts should be categorized as &quot;open book.&quot;
                    </span>
                  </span>
                </label>
              </fieldset>
            </div>

            <h3 className="mb-3 mt-6 text-base font-semibold text-[var(--bt-text)]">Address</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Field label="Street address">
                  <input name="addressLine1" defaultValue={job.addressLine1 ?? ""} className={inputClass} style={inputStyle} />
                </Field>
              </div>
              <Field label="Address line 2">
                <input name="addressLine2" defaultValue={job.addressLine2 ?? ""} className={inputClass} style={inputStyle} />
              </Field>
              <Field label="City">
                <input name="city" defaultValue={job.city ?? ""} className={inputClass} style={inputStyle} />
              </Field>
              <Field label="State">
                <input name="state" defaultValue={job.state ?? ""} className={inputClass} style={inputStyle} />
              </Field>
              <Field label="Zip code">
                <input name="postalCode" defaultValue={job.postalCode ?? ""} className={inputClass} style={inputStyle} />
              </Field>
            </div>

          </Card>

          <Card title="Notes">
            <div className="grid gap-4">
              <Field label="Notes for internal users">
                <textarea name="notesInternal" rows={3} maxLength={2500} defaultValue={job.notesInternal ?? ""} className={inputClass} style={inputStyle} />
                <span className="text-xs text-[var(--bt-muted)]">Maximum 2500 characters</span>
              </Field>
              <Field label="Notes for subs/vendors">
                <textarea name="notesSubs" rows={3} maxLength={2500} defaultValue={job.notesSubs ?? ""} className={inputClass} style={inputStyle} />
                <span className="text-xs text-[var(--bt-muted)]">Maximum 2500 characters</span>
              </Field>
            </div>
          </Card>

          <Card title={`Custom fields (${extras.customFields.length})`}>
            {extras.customFields.length === 0 ? (
              <p className="text-sm text-[var(--bt-muted)]">No custom fields yet. Add one to track something specific to your jobs.</p>
            ) : (
              <div className="grid gap-4">
                {extras.customFields.map((field) =>
                  field.type === "CHECKBOX" ? (
                    <label key={field.id} className="flex items-center gap-2 text-sm text-[var(--bt-text)]">
                      <input type="checkbox" name={`cf_${field.id}`} defaultChecked={field.value === true} />
                      {field.name}
                    </label>
                  ) : (
                    <Field key={field.id} label={field.name}>
                      <input name={`cf_${field.id}`} defaultValue={typeof field.value === "string" ? field.value : ""} className={inputClass} style={inputStyle} />
                    </Field>
                  ),
                )}
              </div>
            )}
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <Card title="Property">
            <div className="grid gap-4">
              <fieldset className="grid gap-1.5 text-sm">
                <legend className="mb-1 text-xs font-medium text-[var(--bt-muted)]">Funded by construction loan</legend>
                <label className="flex items-center gap-2">
                  <input type="radio" name="fundedByLoan" value="yes" defaultChecked={job.fundedByLoan === true} />
                  Yes
                </label>
                <label className="flex items-center gap-2">
                  <input type="radio" name="fundedByLoan" value="no" defaultChecked={job.fundedByLoan === false} />
                  No
                </label>
              </fieldset>
              <Field label="Square feet">
                <input name="sqft" type="number" min={0} defaultValue={job.sqft ?? ""} className={inputClass} style={inputStyle} />
              </Field>
              <Field label="Permit number">
                <input name="permitNumber" defaultValue={job.permitNumber ?? ""} className={inputClass} style={inputStyle} />
              </Field>
              <Field label="Lot info">
                <input name="lotInfo" maxLength={35} defaultValue={job.lotInfo ?? ""} className={inputClass} style={inputStyle} />
                <span className="text-xs text-[var(--bt-muted)]">Maximum 35 characters</span>
              </Field>
            </div>
          </Card>

          <Card title="Schedule">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Projected start">
                <input name="projectedStart" type="date" defaultValue={toDateInputValue(job.projectedStart)} className={inputClass} style={inputStyle} />
              </Field>
              <Field label="Actual start">
                <input name="actualStart" type="date" defaultValue={toDateInputValue(job.actualStart)} className={inputClass} style={inputStyle} />
              </Field>
              <Field label="Projected completion">
                <input name="projectedEnd" type="date" defaultValue={toDateInputValue(job.projectedEnd)} className={inputClass} style={inputStyle} />
              </Field>
              <Field label="Actual completion">
                <input name="actualEnd" type="date" defaultValue={toDateInputValue(job.actualEnd)} className={inputClass} style={inputStyle} />
              </Field>
            </div>
            <div className="mt-4">
              <Field label="Schedule color">
                <input name="scheduleColor" type="color" defaultValue={job.scheduleColor ?? "#2563eb"} className="h-9 w-20 rounded border" style={inputStyle} />
              </Field>
            </div>
          </Card>

          <Card title="Additional information">
            <div className="grid gap-4">
              <Field label="Job group">
                <select name="jobGroupId" defaultValue={job.jobGroupId ?? ""} className={inputClass} style={inputStyle}>
                  <option value="">None</option>
                  {jobGroups.map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.name}
                    </option>
                  ))}
                </select>
                <Link href="/job-groups" className="text-xs font-medium text-[var(--bt-primary)] hover:underline">
                  Manage job groups
                </Link>
              </Field>
              <div className="grid gap-1 text-sm">
                <span className="text-xs font-medium text-[var(--bt-muted)]">Project managers</span>
                {extras.projectManagers.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {extras.projectManagers.map((pm) => (
                      <span key={pm.id} className="rounded-full px-2.5 py-1 text-xs font-medium" style={{ background: "var(--bt-panel-bg-muted)" }}>
                        {pm.name}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className="text-sm text-[var(--bt-muted)]">None assigned.</span>
                )}
                <Link href={`/jobs/${job.id}/settings?tab=internal-users`} className="text-xs font-medium text-[var(--bt-primary)] hover:underline">
                  Assign on the Internal users tab
                </Link>
              </div>
            </div>
          </Card>

          <Card
            title="QuickBooks"
            action={
              <span
                className="rounded-full px-2.5 py-1 text-xs font-semibold"
                style={extras.quickbooks.linked ? { background: "var(--bt-status-open-bg)", color: "var(--bt-status-open-text)" } : { background: "var(--bt-panel-bg-muted)", color: "var(--bt-muted)" }}
              >
                {extras.quickbooks.linked ? "Linked" : "Not linked"}
              </span>
            }
          >
            <dl className="grid gap-3 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-[var(--bt-muted)]">Job</dt>
                <dd className="text-right font-medium text-[var(--bt-text)]">{job.name}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-[var(--bt-muted)]">QuickBooks sub customer</dt>
                <dd className="text-right font-medium text-[var(--bt-text)]">{extras.quickbooks.linked ? `Id ${job.qboCustomerId}` : "Created when the job syncs"}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-[var(--bt-muted)]">Client</dt>
                <dd className="text-right font-medium text-[var(--bt-text)]">{extras.quickbooks.clientName ?? "No client yet"}</dd>
              </div>
            </dl>
            <Link href="/settings/quickbooks" className="mt-3 inline-block text-xs font-medium text-[var(--bt-primary)] hover:underline">
              QuickBooks settings
            </Link>
          </Card>

          {state.error ? (
            <p role="alert" className="text-sm text-red-600">
              {state.error}
            </p>
          ) : null}
          {state.ok ? <p className="text-sm text-emerald-700">Saved.</p> : null}
        </div>
      </form>
    </div>
    {/* Outside the details form on purpose: forms cannot nest. */}
    {extras.addCustomFieldControl}
    </>
  );
}
