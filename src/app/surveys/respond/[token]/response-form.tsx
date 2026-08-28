"use client";

import { useActionState } from "react";

import { submitSurveyResponseAction, type ActionState } from "./actions";

const INITIAL: ActionState = {};

export interface QuestionOption {
  readonly id: string;
  readonly prompt: string;
}

export function SurveyResponseForm({ token, questions }: { token: string; questions: readonly QuestionOption[] }) {
  const [state, formAction, pending] = useActionState(submitSurveyResponseAction, INITIAL);

  if (state.ok) {
    return <p className="text-sm text-[var(--bt-text)]">Thanks — your response has been recorded.</p>;
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />
      {questions.map((question) => (
        <label key={question.id} className="grid gap-1 text-sm">
          <input type="hidden" name="questionId" value={question.id} />
          <span className="font-medium text-[var(--bt-text)]">{question.prompt}</span>
          <textarea
            name={`answer_${question.id}`}
            rows={3}
            className="rounded border px-3 py-2 text-sm outline-none focus:border-[var(--bt-primary)]"
            style={{ borderColor: "var(--bt-border)" }}
          />
        </label>
      ))}
      {state.error ? (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      ) : null}
      <div>
        <button type="submit" disabled={pending} className="rounded px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" style={{ background: "var(--bt-primary)" }}>
          {pending ? "Submitting…" : "Submit"}
        </button>
      </div>
    </form>
  );
}
