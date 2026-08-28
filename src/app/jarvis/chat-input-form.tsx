"use client";

import { useActionState, useRef } from "react";

import { sendJarvisMessageAction, initialJarvisActionState } from "./actions";

export function ChatInputForm({ conversationId }: { conversationId?: string }) {
  const [state, formAction, pending] = useActionState(sendJarvisMessageAction, initialJarvisActionState);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      action={(formData) => {
        formAction(formData);
        formRef.current?.reset();
      }}
      className="flex flex-col gap-2 border-t bg-white p-3"
      style={{ borderColor: "var(--bt-border)" }}
    >
      {conversationId ? <input type="hidden" name="conversationId" value={conversationId} /> : null}
      <div className="flex items-end gap-2">
        <textarea
          name="text"
          required
          rows={2}
          placeholder="Ask Jarvis anything…"
          className="flex-1 resize-none rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]"
          style={{ borderColor: "var(--bt-border)" }}
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          style={{ background: "var(--bt-primary)" }}
        >
          {pending ? "Thinking…" : "Send"}
        </button>
      </div>
      {state.error ? (
        <p role="alert" className="text-xs text-red-600">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
