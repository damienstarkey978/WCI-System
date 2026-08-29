"use client";

import { useState, useTransition } from "react";

import { revokeApiKeyAction } from "./actions";

export function RevokeButton({ apiKeyId, name }: { apiKeyId: string; name: string }) {
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);

  if (confirming) {
    return (
      <span className="inline-flex items-center gap-2 text-xs">
        Revoke &quot;{name}&quot;?
        <button
          type="button"
          disabled={pending}
          onClick={() => startTransition(() => revokeApiKeyAction(apiKeyId))}
          className="font-semibold text-red-600 hover:underline disabled:opacity-50"
        >
          {pending ? "Revoking…" : "Yes, revoke"}
        </button>
        <button type="button" onClick={() => setConfirming(false)} className="text-[var(--bt-muted)] hover:underline">
          Cancel
        </button>
      </span>
    );
  }

  return (
    <button type="button" onClick={() => setConfirming(true)} className="text-xs font-semibold text-red-600 hover:underline">
      Revoke
    </button>
  );
}
