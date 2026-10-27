"use client";

import { useActionState } from "react";

import { companySignProposalAction, type ActionState } from "./actions";

const INITIAL: ActionState = {};

export function CompanySignButton({
  proposalId,
  defaultName,
  alreadySigned,
}: {
  readonly proposalId: string;
  readonly defaultName: string;
  readonly alreadySigned: boolean;
}) {
  const [state, formAction, pending] = useActionState(companySignProposalAction, INITIAL);

  if (alreadySigned || state.ok) {
    return <p className="text-xs text-emerald-700">Company signature on file.</p>;
  }

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="proposalId" value={proposalId} />
      <input
        name="signatureName"
        defaultValue={defaultName}
        required
        placeholder="Type your name to sign for WCI"
        className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]"
        style={{ borderColor: "var(--bt-border)" }}
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded px-3 py-2 text-sm font-semibold text-[var(--bt-on-primary)] disabled:opacity-50"
        style={{ background: "var(--bt-primary)" }}
      >
        {pending ? "Signing…" : "Sign as World Construction Inc."}
      </button>
      {state.error ? (
        <p role="alert" className="text-xs text-red-600">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
