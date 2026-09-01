"use client";

import { useActionState, useRef } from "react";

import { JarvisVoiceButton } from "@/components/jarvis/JarvisVoiceButton";
import { useFunUi } from "@/components/jarvis/useFunUi";
import { JARVIS_SUGGESTIONS } from "@/lib/jarvis/suggestions";

import { sendJarvisMessageAction, type ActionState } from "./actions";

const INITIAL: ActionState = {};

export function ChatInputForm({ conversationId, showSuggestions }: { conversationId?: string; showSuggestions?: boolean }) {
  const [state, formAction, pending] = useActionState(sendJarvisMessageAction, INITIAL);
  const formRef = useRef<HTMLFormElement>(null);
  const funUi = useFunUi();

  function fillSuggestion(suggestion: string) {
    const textarea = formRef.current?.elements.namedItem("text");
    if (textarea instanceof HTMLTextAreaElement) {
      textarea.value = suggestion;
      textarea.focus();
    }
  }

  function appendVoiceTranscript(text: string) {
    const textarea = formRef.current?.elements.namedItem("text");
    if (textarea instanceof HTMLTextAreaElement) {
      textarea.value = textarea.value ? `${textarea.value} ${text}` : text;
      textarea.focus();
    }
  }

  return (
    <form
      ref={formRef}
      action={(formData) => {
        formAction(formData);
        formRef.current?.reset();
      }}
      className="flex flex-col gap-2 border-t bg-[var(--bt-panel-bg)] p-3"
      style={{ borderColor: "var(--bt-border)" }}
    >
      {conversationId ? <input type="hidden" name="conversationId" value={conversationId} /> : null}
      {showSuggestions ? (
        <div className="flex flex-wrap gap-1.5">
          {JARVIS_SUGGESTIONS.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => fillSuggestion(suggestion)}
              className="rounded-full border px-3 py-1 text-xs text-[var(--bt-text)] hover:bg-black/5"
              style={{ borderColor: "var(--bt-border)" }}
            >
              {suggestion}
            </button>
          ))}
        </div>
      ) : null}
      <JarvisVoiceButton onTranscript={appendVoiceTranscript} onFinish={() => formRef.current?.requestSubmit()} funUi={funUi} />
      <div className="flex items-end gap-2">
        <textarea
          name="text"
          required
          rows={2}
          placeholder="Ask Jarvis anything…"
          // text-base (16px), not text-sm — iOS Safari auto-zooms the page on
          // focus for any input under 16px.
          className="flex-1 resize-none rounded border px-3 py-2 text-base outline-none focus:border-[var(--bt-primary)]"
          style={{ borderColor: "var(--bt-border)" }}
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded px-4 py-2 text-sm font-semibold text-[var(--bt-on-primary)] disabled:opacity-50"
          style={{ background: "var(--bt-primary)" }}
        >
          {pending ? "Thinking…" : "Send"}
        </button>
      </div>
      <label className="flex items-center gap-1.5 text-xs text-[var(--bt-muted)]">
        <span>Attach photos:</span>
        <input type="file" name="attachments" multiple accept="image/jpeg,image/png,image/webp,image/gif" className="text-xs" />
      </label>
      {state.error ? (
        <p role="alert" className="text-xs text-red-600">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
