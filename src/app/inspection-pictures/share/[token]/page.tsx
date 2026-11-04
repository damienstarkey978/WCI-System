import { PhotoGallery } from "@/components/files/PhotoGallery";
import {
  getInspectionFolderForShareToken,
  InvalidInspectionShareLinkError,
} from "@/lib/permitting/inspection-pictures";

export const dynamic = "force-dynamic";

/**
 * Public, no-login inspector page for one Inspection Pictures folder.
 * Redeemed via InspectionPictureShareLink (same secure-token pattern as
 * SubmittalReviewLink / SurveyResponseLink — no Client/Vendor seat).
 *
 * View-only: inspectors see company, folder, job, live Building permit #, and
 * the photo grid (shared lightbox). Upload stays on the staff / bot Files path.
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
        <p className="mt-1 text-sm text-[var(--bt-muted)]">{resolved.jobName}</p>
        {resolved.buildingPermitNumber ? (
          <p className="mt-1 text-sm text-[var(--bt-muted)]">
            Building permit # {resolved.buildingPermitNumber}
          </p>
        ) : null}
      </header>

      <div>
        <h2 className="mb-2 text-sm font-semibold text-[var(--bt-text)]">
          Photos ({resolved.photos.length})
        </h2>
        <PhotoGallery
          photos={resolved.photos.map((file) => ({
            id: file.id,
            fileName: file.fileName,
            url: file.url,
            category: "PHOTO",
          }))}
        />
      </div>
    </div>
  );
}
