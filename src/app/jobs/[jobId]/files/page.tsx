import Link from "next/link";
import { notFound } from "next/navigation";

import { SetupNotice } from "@/app/admin/setup-notice";
import { EmptyState } from "@/components/shell/EmptyState";
import { currentAppUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { resolveFileUrl } from "@/lib/files/service";

import { FileCard } from "./file-card";
import { UploadForm } from "./upload-form";

export const dynamic = "force-dynamic";

const CATEGORIES = [
  { value: "ALL", label: "All" },
  { value: "PHOTO", label: "Photos" },
  { value: "PRESALE_PHOTO", label: "Pre-Sale Photos" },
  { value: "DOCUMENT", label: "Documents" },
  { value: "VIDEO", label: "Videos" },
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

  const filesWithUrls = await Promise.all(
    files.map(async (file) => ({
      id: file.id,
      fileName: file.fileName,
      category: file.category,
      url: await resolveFileUrl(file.url),
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
      <h1 className="text-xl font-semibold text-[var(--bt-text)]">Files — {job.name}</h1>

      <UploadForm jobId={job.id} />

      <div className="flex gap-2 border-b pb-2" style={{ borderColor: "var(--bt-border)" }}>
        {CATEGORIES.map((cat) => (
          <Link
            key={cat.value}
            href={`/jobs/${job.id}/files${cat.value === "ALL" ? "" : `?category=${cat.value}`}`}
            className="rounded px-3 py-1.5 text-sm font-medium"
            style={activeCategory === cat.value ? { background: "var(--bt-primary)", color: "white" } : { color: "var(--bt-muted)" }}
          >
            {cat.label}
          </Link>
        ))}
      </div>

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
