"use client";

import { useActionState } from "react";

import { updateChangeOrderAction, type ActionState } from "../actions";

const INITIAL: ActionState = {};

export function ChangeOrderDetailForm({
  jobId,
  changeOrderId,
  coNumber,
  editable,
  initial,
}: {
  jobId: string;
  changeOrderId: string;
  coNumber: string;
  editable: boolean;
  initial: {
    title: string;
    deadline: string;
    notesBuilder: string;
    notesClient: string;
    invoiceOnApproval: boolean;
  };
}) {
  const [state, formAction, pending] = useActionState(updateChangeOrderAction, INITIAL);

  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-lg border bg-[var(--bt-panel-bg)] p-4" style={{ borderColor: "var(--bt-border)" }}>
      <input type="hidden" name="jobId" value={jobId} />
      <input type="hidden" name="changeOrderId" value={changeOrderId} />

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm">
          <span className="text-xs font-medium text-[var(--bt-muted)]">Title</span>
          <input
            name="title"
            required
            defaultValue={initial.title}
            disabled={!editable}
            className="rounded border px-3 py-2 text-sm disabled:opacity-60"
            style={{ borderColor: "var(--bt-border)" }}
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-xs font-medium text-[var(--bt-muted)]">ID #</span>
          <input
            value={coNumber}
            readOnly
            className="rounded border px-3 py-2 text-sm opacity-80"
            style={{ borderColor: "var(--bt-border)", background: "var(--bt-bg)" }}
          />
        </label>
      </div>

      <label className="grid gap-1 text-sm">
        <span className="text-xs font-medium text-[var(--bt-muted)]">Approval deadline</span>
        <input
          type="date"
          name="deadline"
          defaultValue={initial.deadline}
          disabled={!editable}
          className="rounded border px-3 py-2 text-sm disabled:opacity-60"
          style={{ borderColor: "var(--bt-border)" }}
        />
      </label>

      <label className="flex items-center gap-2 text-sm text-[var(--bt-text)]">
        <input type="checkbox" name="invoiceOnApproval" defaultChecked={initial.invoiceOnApproval} disabled={!editable} />
        Invoice client upon approval
      </label>

      <label className="grid gap-1 text-sm">
        <span className="text-xs font-medium text-[var(--bt-muted)]">Builder notes</span>
        <textarea
          name="notesBuilder"
          rows={3}
          defaultValue={initial.notesBuilder}
          disabled={!editable}
          className="rounded border px-3 py-2 text-sm disabled:opacity-60"
          style={{ borderColor: "var(--bt-border)" }}
        />
      </label>
      <label className="grid gap-1 text-sm">
        <span className="text-xs font-medium text-[var(--bt-muted)]">Scope of work</span>
        <textarea
          name="notesClient"
          rows={4}
          defaultValue={initial.notesClient}
          disabled={!editable}
          className="rounded border px-3 py-2 text-sm disabled:opacity-60"
          style={{ borderColor: "var(--bt-border)" }}
        />
      </label>

      {state.error ? <p className="text-xs text-red-600">{state.error}</p> : null}
      {state.ok ? <p className="text-xs text-green-700">Saved.</p> : null}

      {editable ? (
        <button
          type="submit"
          disabled={pending}
          className="self-start rounded border px-4 py-2 text-sm font-semibold disabled:opacity-50"
          style={{ borderColor: "var(--bt-border)" }}
        >
          {pending ? "Saving…" : "Save"}
        </button>
      ) : null}
    </form>
  );
}
