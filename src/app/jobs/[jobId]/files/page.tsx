import Link from "next/link";
import { notFound } from "next/navigation";

import { SetupNotice } from "@/app/admin/setup-notice";
import { CreateModal } from "@/components/shell/CreateModal";
import { EmptyState } from "@/components/shell/EmptyState";
import { PageHeader } from "@/components/shell/PageHeader";
import { currentAppUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { resolveFileUrlSafe } from "@/lib/files/service";

import { FileCard } from "./file-card";
import { UploadForm } from "./upload-form";

export const dynamic = "force-dynamic";

const CATEGORIES = [
  { value: "ALL", label: "All" },
  { value: "DOCUMENT", label: "Documents" },
  { value: "PHOTO", label: "Photos" },
  { value: "VIDEO", label: "Videos" },
  { value: "PRESALE_PHOTO", label: "Pre-Sale Photos" },
] as const;

export default async function FilesPage({
  params,
  searchParams,
}: PageProps<"/jobs/[jobId]/files">) {
  const { jobId } = await params;

  let user;
  try {
    user = await currentAppUser();
  } catch (error) {
    return <SetupNotice detail={error instanceof Error ? error.message : String(error)} />;
  }
  if (!user) {
    return <SetupNotice detail="No organization found. Seed the database, then reload." />;
  }

  const job = await db.job.findFirst({ where: { id: jobId, organizationId: user.organizationId } });
  if (!job) notFound();

  const { category } = await searchParams;
  const activeCategory = typeof category === "string" && category !== "ALL" ? category : "ALL";

  const files = await db.file.findMany({
    where: { jobId: job.id, ...(activeCategory !== "ALL" ? { category: activeCategory as "DOCUMENT" | "PHOTO" | "VIDEO" | "PRESALE_PHOTO" } : {}) },
    orderBy: { createdAt: "desc" },
    include: { uploadedByUser: true },
  });

  // resolveFileUrlSafe, not resolveFileUrl: one row that can't be signed used to
  // reject this Promise.all and take the whole page down with it, hiding every good
  // file on the job behind React error #441.
  const filesWithUrls = await Promise.all(
    files.map(async (file) => ({
      id: file.id,
      fileName: file.fileName,
      category: file.category,
      url: await resolveFileUrlSafe(file.url),
      mimeType: file.mimeType,
      sizeBytes: file.sizeBytes,
      clientVisible: file.clientVisible,
      subVisible: file.subVisible,
      uploaderEmail: file.uploadedByUser.email,
      uploadedAt: formatDate(file.createdAt),
    })),
  );

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 p-6">
      <PageHeader
        jobName={job.name}
        title="Files"
        action={
          <CreateModal triggerLabel="+ Upload" title="Upload a file">
            <UploadForm jobId={job.id} />
          </CreateModal>
        }
      />

      <nav className="flex gap-1 border-b" style={{ borderColor: "var(--bt-border)" }}>
        {CATEGORIES.map((cat) => (
          <Link
            key={cat.value}
            href={`/jobs/${job.id}/files${cat.value === "ALL" ? "" : `?category=${cat.value}`}`}
            className="-mb-px border-b-2 px-3 py-2 text-sm font-medium transition"
            style={{
              borderColor: activeCategory === cat.value ? "var(--bt-primary)" : "transparent",
              color: activeCategory === cat.value ? "var(--bt-primary)" : "var(--bt-muted)",
            }}
          >
            {cat.label}
          </Link>
        ))}
      </nav>

      {filesWithUrls.length === 0 ? (
        <EmptyState title="No files yet" description="Documents, photos, and videos attached to this job will appear here." />
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {filesWithUrls.map((file) => (
            <FileCard key={file.id} jobId={job.id} file={file} />
          ))}
        </div>
      )}
    </div>
  );
}
