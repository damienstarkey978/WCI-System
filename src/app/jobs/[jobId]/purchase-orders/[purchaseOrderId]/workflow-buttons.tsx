"use client";

import { useActionState, useState } from "react";

import {
  amendAction,
  approveInternallyAction,
  declineAction,
  recallAction,
  sendForApprovalAction,
  setWorkStatusAction,
  type ActionState,
} from "../actions";

const INITIAL: ActionState = {};

const PRIMARY_CLASS = "rounded px-3 py-1.5 text-xs font-semibold text-[var(--bt-on-primary)] disabled:opacity-50";
const SECONDARY_CLASS =
  "rounded border px-3 py-1.5 text-xs font-semibold text-[var(--bt-text)] disabled:opacity-50 hover:bg-black/5";

/**
 * One small form per workflow action. Each posts only its own hidden ids, so the
 * server action it targets is the only thing it can possibly do — see the note in
 * actions.ts about not routing these through a single dispatcher.
 *
 * Destructive actions (decline, recall) carry a reason field and a confirm, since
 * both are visible to the vendor and recall is terminal.
 */
function ActionForm({
  action,
  jobId,
  purchaseOrderId,
  label,
  variant = "secondary",
  withReason = false,
  confirmMessage,
  extra,
}: {
  action: (previous: ActionState, formData: FormData) => Promise<ActionState>;
  jobId: string;
  purchaseOrderId: string;
  label: string;
  variant?: "primary" | "secondary";
  withReason?: boolean;
  confirmMessage?: string;
  extra?: Record<string, string>;
}) {
  const [state, formAction, pending] = useActionState(action, INITIAL);
  const [armed, setArmed] = useState(false);

  const needsConfirm = Boolean(confirmMessage);
  const showSubmit = !needsConfirm || armed;

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="jobId" value={jobId} />
      <input type="hidden" name="purchaseOrderId" value={purchaseOrderId} />
      {Object.entries(extra ?? {}).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      {withReason && showSubmit ? (
        <input
          name="reason"
          placeholder="Reason (optional)"
          className="rounded border px-2 py-1.5 text-xs outline-none focus:border-[var(--bt-primary)]"
          style={{ borderColor: "var(--bt-border)" }}
        />
      ) : null}

      {/*
        Confirmation is a second button rather than window.confirm().

        The native dialog blocked the renderer synchronously from inside the submit
        handler, which froze the tab outright — Amend and Recall were the only two
        actions carrying a confirm, and Amend was unusable because of it. The cancel
        path was broken too: calling event.preventDefault() in onSubmit does not
        reliably stop a React form `action` from dispatching, since the action runs
        through React's own path rather than the native submit.

        Two buttons have neither problem, and the consequence is visible in the page
        instead of in a modal the user has to read and dismiss.
      */}
      {needsConfirm && !armed ? (
        <button
          type="button"
          onClick={() => setArmed(true)}
          className={variant === "primary" ? PRIMARY_CLASS : SECONDARY_CLASS}
          style={variant === "primary" ? { background: "var(--bt-primary)" } : { borderColor: "var(--bt-border)" }}
        >
          {label}
        </button>
      ) : null}

      {showSubmit ? (
        <>
          <button
            type="submit"
            disabled={pending}
            className={needsConfirm ? PRIMARY_CLASS : variant === "primary" ? PRIMARY_CLASS : SECONDARY_CLASS}
            style={
              needsConfirm
                ? { background: "var(--bt-danger)" }
                : variant === "primary"
                  ? { background: "var(--bt-primary)" }
                  : { borderColor: "var(--bt-border)" }
            }
          >
            {pending ? "Working…" : needsConfirm ? `Yes, ${label.toLowerCase()}` : label}
          </button>
          {needsConfirm ? (
            <button
              type="button"
              onClick={() => setArmed(false)}
              disabled={pending}
              className="text-xs text-[var(--bt-muted)] hover:underline disabled:opacity-50"
            >
              Cancel
            </button>
          ) : null}
        </>
      ) : null}

      {needsConfirm && armed ? (
        <span className="text-xs text-[var(--bt-muted)]">{confirmMessage}</span>
      ) : null}

      {state.error ? (
        <span role="alert" className="text-xs" style={{ color: "var(--bt-danger)" }}>
          {state.error}
        </span>
      ) : null}
    </form>
  );
}

export function WorkflowButtons({
  jobId,
  purchaseOrderId,
  status,
  workComplete,
}: {
  jobId: string;
  purchaseOrderId: string;
  status: string;
  workComplete: boolean;
}) {
  // Mirrors ALLOWED_TRANSITIONS in src/lib/purchase-orders/workflow.ts. The server
  // re-checks regardless — this only decides which buttons are worth showing.
  const canSend = status === "DRAFT" || status === "DECLINED";
  const canApproveOrDecline = status === "PENDING_APPROVAL";
  const canAmend = status !== "CANCELLED";
  const canRecall = status !== "CANCELLED";

  return (
    <div className="flex flex-col gap-2">
      {canSend ? (
        <ActionForm
          action={sendForApprovalAction}
          jobId={jobId}
          purchaseOrderId={purchaseOrderId}
          label="Send to vendor for approval"
          variant="primary"
        />
      ) : null}

      {canApproveOrDecline ? (
        <>
          <ActionForm
            action={approveInternallyAction}
            jobId={jobId}
            purchaseOrderId={purchaseOrderId}
            label="Approve internally"
            variant="primary"
          />
          <ActionForm
            action={declineAction}
            jobId={jobId}
            purchaseOrderId={purchaseOrderId}
            label="Decline"
            withReason
          />
        </>
      ) : null}

      <ActionForm
        action={setWorkStatusAction}
        jobId={jobId}
        purchaseOrderId={purchaseOrderId}
        label={workComplete ? "Reopen work" : "Mark work complete"}
        extra={{ workComplete: workComplete ? "false" : "true" }}
      />

      {canAmend ? (
        <ActionForm
          action={amendAction}
          jobId={jobId}
          purchaseOrderId={purchaseOrderId}
          label="Amend"
          withReason
          confirmMessage="Bumps the version, clears the vendor's acceptance, and sends this PO back for approval."
        />
      ) : null}

      {canRecall ? (
        <ActionForm
          action={recallAction}
          jobId={jobId}
          purchaseOrderId={purchaseOrderId}
          label="Recall"
          withReason
          confirmMessage="Voids this PO permanently and removes it from committed cost. This cannot be undone."
        />
      ) : null}
    </div>
  );
}
