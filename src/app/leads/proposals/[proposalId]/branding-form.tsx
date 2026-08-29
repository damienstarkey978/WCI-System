"use client";

import { useActionState } from "react";

import { updateBrandingAction, type ActionState } from "./actions";

const INITIAL: ActionState = {};

export function BrandingForm({ proposalId, accentColor, logoUrl }: { proposalId: string; accentColor: string; logoUrl: string }) {
  const [state, formAction, pending] = useActionState(updateBrandingAction, INITIAL);

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="proposalId" value={proposalId} />
      <label className="flex flex-col gap-1 text-xs text-[var(--bt-muted)]">
        Accent color
        <div className="flex items-center gap-2">
          <input type="color" name="accentColorPicker" defaultValue={accentColor || "#0f4c81"} className="h-8 w-8 rounded border p-0" style={{ borderColor: "var(--bt-border)" }} onChange={(e) => {
            const hidden = e.currentTarget.form?.elements.namedItem("accentColor") as HTMLInputElement | null;
            if (hidden) hidden.value = e.currentTarget.value;
          }} />
          <input type="hidden" name="accentColor" defaultValue={accentColor} />
          <span className="text-xs text-[var(--bt-text)]">{accentColor || "Default"}</span>
        </div>
      </label>
      <label className="flex flex-1 flex-col gap-1 text-xs text-[var(--bt-muted)]">
        Logo URL
        <input
          name="logoUrl"
          defaultValue={logoUrl}
          placeholder="https://…"
          className="min-w-[16rem] rounded border px-2 py-1.5 text-sm outline-none focus:border-[var(--bt-primary)]"
          style={{ borderColor: "var(--bt-border)" }}
        />
      </label>
      <button type="submit" disabled={pending} className="rounded border px-3 py-1.5 text-xs font-medium text-[var(--bt-text)]" style={{ borderColor: "var(--bt-border)" }}>
        {pending ? "Saving…" : "Save branding"}
      </button>
      {state.error ? <span className="text-xs text-red-600">{state.error}</span> : null}
    </form>
  );
}
