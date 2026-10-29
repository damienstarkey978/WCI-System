import {
  getInspectionFolderForShareToken,
  InvalidInspectionShareLinkError,
} from "@/lib/permitting/inspection-pictures";

import { InspectorPhotoCapture } from "./inspector-capture";

export const dynamic = "force-dynamic";

/**
 * Public, no-login inspector page for one Inspection Pictures folder.
 * Redeemed via InspectionPictureShareLink (same secure-token pattern as
 * SubmittalReviewLink / SurveyResponseLink — no Client/Vendor seat).
 */
export default async function InspectionPictureSharePage({
  params,
}: PageProps<"/inspection-pictures/share/[token]">) {
  const { token } = await params;

  let resolved: Awaited<ReturnType<typeof getInspectionFolderForShareToken>> | null = null;
  let invalidMessage: string | null = null;
  try {
    resolved = await getInspectionFolderForShareToken(token);
  } catch (error) {
    if (error instanceof InvalidInspectionShareLinkError) {
      invalidMessage = error.message;
    } else {
      throw error;
    }
  }

  if (!resolved) {
    return (
      <div className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center gap-2 p-6 text-center">
        <h1 className="text-lg font-semibold text-[var(--bt-text)]">Link no longer valid</h1>
        <p className="text-sm text-[var(--bt-muted)]">{invalidMessage}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col gap-4 p-4 pb-[max(2.5rem,env(safe-area-inset-bottom))] sm:p-6">
      <header className="pt-[max(0.5rem,env(safe-area-inset-top))]">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--bt-muted)]">
          {resolved.companyName}
        </p>
        <h1 className="mt-1 text-xl font-semibold leading-tight text-[var(--bt-text)] sm:text-2xl">
          {resolved.inspectionName}
        </h1>
        <p className="mt-1 text-sm text-[var(--bt-muted)]">
          {resolved.jobName}
          {resolved.label ? ` · for ${resolved.label}` : ""}
        </p>
        <p className="mt-2 text-xs text-[var(--bt-muted)]">
          Photos for this inspection folder only. No login required.
        </p>
      </header>

      {resolved.requiresTermiteCertNote ? (
        <p className="rounded-lg border px-3 py-2 text-sm text-[var(--bt-hazard)]" style={{ borderColor: "var(--bt-border)" }}>
          Slab inspections also need a termite certificate before pass (handled by WCI staff).
        </p>
      ) : null}

      {(resolved.tips.length > 0 || resolved.guideUrl) && (
        <aside className="rounded-lg border bg-[var(--bt-panel-bg)] p-3" style={{ borderColor: "var(--bt-border)" }}>
          <h2 className="text-sm font-semibold text-[var(--bt-text)]">Photo tips</h2>
          {resolved.tips.length > 0 ? (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-[var(--bt-muted)]">
              {resolved.tips.map((tip) => (
                <li key={tip}>{tip}</li>
              ))}
            </ul>
          ) : null}
          {resolved.guideUrl ? (
            <a
              href={resolved.guideUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-block text-sm font-medium text-[var(--bt-primary)] hover:underline"
            >
              Open photo guide
            </a>
          ) : null}
        </aside>
      )}

      <InspectorPhotoCapture
        token={token}
        existing={resolved.photos.map((p) => ({ id: p.id, fileName: p.fileName, url: p.url }))}
      />
    </div>
  );
}
