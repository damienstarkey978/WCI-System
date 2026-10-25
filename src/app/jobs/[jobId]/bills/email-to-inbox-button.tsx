"use client";

import { useState } from "react";

/** Buildertrend's "Email to Inbox" header button — copies the same forwarding address BillUploader already shows inline. */
export function EmailToInboxButton({ inboxAddress }: { inboxAddress: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText(inboxAddress).then(
          () => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          },
          () => setCopied(false),
        );
      }}
      className="rounded border px-3 py-2 text-sm font-semibold text-[var(--bt-text)] hover:bg-black/5"
      style={{ borderColor: "var(--bt-border)" }}
      title={inboxAddress}
    >
      {copied ? "Copied" : "Email to Inbox"}
    </button>
  );
}
