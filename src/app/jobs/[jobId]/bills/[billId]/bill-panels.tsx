"use client";

import { useActionState } from "react";

import {
  applyLienWaiverAction,
  approveAsMeAction,
  claimFromInboxAction,
  releaseLienWaiverAction,
  setApproversAction,
  setBillStatusAction,
  type BillActionState,
} from "./actions";

const INITIAL: BillActionState = {};

const PRIMARY = "rounded px-3 py-1.5 text-xs font-semibold text-[var(--bt-on-primary)] disabled:opacity-50";
const SECONDARY = "rounded border px-3 py-1.5 text-xs font-semibold text-[var(--bt-text)] disabled:opacity-50 hover:bg-black/5";

function Err({ state }: { state: BillActionState }) {
  if (!state.error) return null;
  return (
    <p role="alert" className="mt-1.5 text-xs" style={{ color: "var(--bt-danger)" }}>
      {state.error}
    </p>
  );
}

/**
 * The status buttons. Which ones appear mirrors ALLOWED_BILL_TRANSITIONS in
 * src/lib/bills/service.ts; the server re-checks regardless, and will also refuse
 * READY_FOR_PAYMENT while approvals are outstanding — that refusal surfaces here as
 * the action's error rather than being pre-empted, so the office sees *why*.
 */
export function StatusActions({
  jobId,
  billId,
  status,
}: {
  jobId: string;
  billId: string;
  status: string;
}) {
  const [claimState, claimAction, claiming] = useActionState(claimFromInboxAction, INITIAL);
  const [statusState, statusAction, changing] = useActionState(setBillStatusAction, INITIAL);

  const next: { label: string; value: string; primary?: boolean }[] = [];
  if (status === "IN_REVIEW") next.push({ label: "Approve", value: "APPROVED", primary: true });
  if (status === "APPROVED") next.push({ label: "Mark ready for payment", value: "READY_FOR_PAYMENT", primary: true });
  if (status === "READY_FOR_PAYMENT") next.push({ label: "Mark paid", value: "PAID", primary: true });
  if (status !== "PAID" && status !== "VOID") next.push({ label: "Void", value: "VOID" });

  return (
    <div className="flex flex-col gap-2">
      {status === "INBOX" ? (
        <form action={claimAction}>
          <input type="hidden" name="jobId" value={jobId} />
          <input type="hidden" name="billId" value={billId} />
          <button type="submit" disabled={claiming} className={PRIMARY} style={{ background: "var(--bt-primary)" }}>
            {claiming ? "Opening…" : "Start review"}
          </button>
          <Err state={claimState} />
        </form>
      ) : null}

      {next.map((option) => (
        <form key={option.value} action={statusAction}>
          <input type="hidden" name="jobId" value={jobId} />
          <input type="hidden" name="billId" value={billId} />
          <input type="hidden" name="status" value={option.value} />
          <button
            type="submit"
            disabled={changing}
            className={option.primary ? PRIMARY : SECONDARY}
            style={option.primary ? { background: "var(--bt-primary)" } : { borderColor: "var(--bt-border)" }}
          >
            {changing ? "Working…" : option.label}
          </button>
        </form>
      ))}
      <Err state={statusState} />
    </div>
  );
}

export function ApproversPanel({
  jobId,
  billId,
  staff,
  approvals,
  currentUserId,
}: {
  jobId: string;
  billId: string;
  staff: readonly { id: string; label: string }[];
  approvals: readonly { id: string; approverUserId: string; label: string; approvedAt: string | null; note: string | null }[];
  currentUserId: string;
}) {
  const [assignState, assignAction, assigning] = useActionState(setApproversAction, INITIAL);
  const [approveState, approveAction, approving] = useActionState(approveAsMeAction, INITIAL);

  const mine = approvals.find((approval) => approval.approverUserId === currentUserId);

  return (
    <div className="flex flex-col gap-3">
      {approvals.length === 0 ? (
        <p className="text-xs text-[var(--bt-muted)]">
          No approvers required. This bill can be paid without sign-off.
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {approvals.map((approval) => (
            <li key={approval.id} className="flex items-center justify-between text-sm">
              <span className="text-[var(--bt-text)]">{approval.label}</span>
              <span className="text-xs" style={{ color: approval.approvedAt ? "var(--bt-success)" : "var(--bt-muted)" }}>
                {approval.approvedAt ? `Approved ${approval.approvedAt}` : "Awaiting"}
              </span>
            </li>
          ))}
        </ul>
      )}

      {mine && !mine.approvedAt ? (
        <form action={approveAction} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="jobId" value={jobId} />
          <input type="hidden" name="billId" value={billId} />
          <input
            name="note"
            placeholder="Note (optional)"
            className="min-w-0 flex-1 rounded border px-2 py-1.5 text-xs outline-none focus:border-[var(--bt-primary)]"
            style={{ borderColor: "var(--bt-border)" }}
          />
          <button type="submit" disabled={approving} className={PRIMARY} style={{ background: "var(--bt-primary)" }}>
            {approving ? "Signing…" : "Approve as me"}
          </button>
        </form>
      ) : null}
      <Err state={approveState} />

      <details>
        <summary className="cursor-pointer text-xs text-[var(--bt-muted)]">Change who must approve</summary>
        <form action={assignAction} className="mt-2 flex flex-col gap-2">
          <input type="hidden" name="jobId" value={jobId} />
          <input type="hidden" name="billId" value={billId} />
          <div className="flex max-h-40 flex-col gap-1 overflow-y-auto">
            {staff.map((person) => (
              <label key={person.id} className="flex items-center gap-1.5 text-xs text-[var(--bt-text)]">
                <input
                  type="checkbox"
                  name="approverUserIds"
                  value={person.id}
                  defaultChecked={approvals.some((approval) => approval.approverUserId === person.id)}
                />
                {person.label}
              </label>
            ))}
          </div>
          <button type="submit" disabled={assigning} className={SECONDARY} style={{ borderColor: "var(--bt-border)" }}>
            {assigning ? "Saving…" : "Save approvers"}
          </button>
          <Err state={assignState} />
        </form>
      </details>
    </div>
  );
}

export function LienWaiverPanel({
  jobId,
  billId,
  templates,
  waiver,
}: {
  jobId: string;
  billId: string;
  templates: readonly string[];
  waiver: { id: string; templateName: string; status: string; releasedAt: string | null; body: string | null } | null;
}) {
  const [applyState, applyAction, applying] = useActionState(applyLienWaiverAction, INITIAL);
  const [releaseState, releaseAction, releasing] = useActionState(releaseLienWaiverAction, INITIAL);

  const released = waiver?.status === "RELEASED";

  return (
    <div className="flex flex-col gap-3">
      {waiver ? (
        <>
          <div className="flex items-center justify-between text-sm">
            <span className="text-[var(--bt-text)]">{waiver.templateName}</span>
            <span
              className="rounded px-1.5 py-0.5 text-[10px] font-semibold"
              style={
                released
                  ? { background: "var(--bt-status-open-bg)", color: "var(--bt-status-open-text)" }
                  : { background: "#e5e7eb", color: "#374151" }
              }
            >
              {waiver.status}
            </span>
          </div>
          {released ? (
            <p className="text-xs text-[var(--bt-muted)]">Released {waiver.releasedAt}. This record is now fixed.</p>
          ) : null}
          {waiver.body ? (
            <pre className="max-h-56 overflow-y-auto whitespace-pre-wrap rounded border p-2 text-[11px] leading-relaxed text-[var(--bt-text)]" style={{ borderColor: "var(--bt-border)" }}>
              {waiver.body}
            </pre>
          ) : null}
          {!released ? (
            <form action={releaseAction}>
              <input type="hidden" name="jobId" value={jobId} />
              <input type="hidden" name="billId" value={billId} />
              <input type="hidden" name="lienWaiverId" value={waiver.id} />
              <button type="submit" disabled={releasing} className={PRIMARY} style={{ background: "var(--bt-primary)" }}>
                {releasing ? "Releasing…" : "Mark released"}
              </button>
              <Err state={releaseState} />
            </form>
          ) : null}
        </>
      ) : (
        <p className="text-xs text-[var(--bt-muted)]">No waiver on this bill yet.</p>
      )}

      {!released ? (
        <form action={applyAction} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="jobId" value={jobId} />
          <input type="hidden" name="billId" value={billId} />
          <select
            name="templateName"
            defaultValue={waiver?.templateName ?? templates[0]}
            className="rounded border px-2 py-1.5 text-xs outline-none focus:border-[var(--bt-primary)]"
            style={{ borderColor: "var(--bt-border)" }}
          >
            {templates.map((template) => (
              <option key={template} value={template}>
                {template}
              </option>
            ))}
          </select>
          <button type="submit" disabled={applying} className={SECONDARY} style={{ borderColor: "var(--bt-border)" }}>
            {applying ? "Applying…" : waiver ? "Regenerate" : "Apply"}
          </button>
          <Err state={applyState} />
        </form>
      ) : null}
    </div>
  );
}
