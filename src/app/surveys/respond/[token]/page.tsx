import { getSurveyForResponseToken, InvalidResponseLinkError } from "@/lib/surveys/service";

import { SurveyResponseForm } from "./response-form";

export const dynamic = "force-dynamic";

const TOUCHPOINT_LABEL: Record<string, string> = {
  PRE_PROJECT: "Pre-project",
  MID_PROJECT: "Mid-project",
  POST_COMPLETION: "Post-completion",
};

/**
 * Public, no-login survey response page — the "one signed link" redemption
 * for src/lib/surveys/service.ts's SurveyResponseLink (same headless pattern
 * as the client/vendor approval links, just with no portal account behind
 * it: most survey recipients aren't onboarded Clients or Vendors at all).
 */
export default async function SurveyRespondPage({ params }: PageProps<"/surveys/respond/[token]">) {
  const { token } = await params;

  let resolved: Awaited<ReturnType<typeof getSurveyForResponseToken>> | null = null;
  let invalidMessage: string | null = null;
  try {
    resolved = await getSurveyForResponseToken(token);
  } catch (error) {
    if (error instanceof InvalidResponseLinkError) {
      invalidMessage = error.message;
    } else {
      throw error;
    }
  }

  if (!resolved) {
    return (
      <div className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-2 p-6 text-center">
        <h1 className="text-lg font-semibold text-[var(--bt-text)]">Link no longer valid</h1>
        <p className="text-sm text-[var(--bt-muted)]">{invalidMessage}</p>
      </div>
    );
  }

  const { survey, recipientName } = resolved;

  return (
    <div className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-4 p-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--bt-muted)]">
          {TOUCHPOINT_LABEL[survey.touchpoint] ?? survey.touchpoint} survey
        </p>
        <h1 className="text-xl font-semibold text-[var(--bt-text)]">{survey.title}</h1>
        {recipientName ? <p className="mt-1 text-sm text-[var(--bt-muted)]">Hi {recipientName}, we&apos;d love your feedback.</p> : null}
      </div>
      <div className="rounded-lg border bg-white p-4" style={{ borderColor: "var(--bt-border)" }}>
        <SurveyResponseForm token={token} questions={survey.questions.map((q) => ({ id: q.id, prompt: q.prompt }))} />
      </div>
    </div>
  );
}
