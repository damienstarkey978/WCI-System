import { notFound } from "next/navigation";

import { SetupNotice } from "@/app/admin/setup-notice";
import { EmptyState } from "@/components/shell/EmptyState";
import { currentAppUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

const CATEGORY_LABEL: Record<string, string> = {
  DOCUMENT: "Document",
  PHOTO: "Photo",
  VIDEO: "Video",
};

export default async function FilesPage({ params }: PageProps<"/jobs/[jobId]/files">) {
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

  const files = await db.file.findMany({
    where: { jobId: job.id },
    orderBy: { createdAt: "desc" },
    include: { uploadedByUser: true },
  });

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4 p-6">
      <h1 className="text-xl font-semibold text-[var(--bt-text)]">Files — {job.name}</h1>

      {files.length === 0 ? (
        <EmptyState title="No files yet" description="Documents, photos, and videos attached to this job will appear here." />
      ) : (
        <div className="overflow-hidden rounded-lg border bg-white" style={{ borderColor: "var(--bt-border)" }}>
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b text-xs font-semibold uppercase tracking-wide text-[var(--bt-muted)]" style={{ borderColor: "var(--bt-border)" }}>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Uploaded by</th>
                <th className="px-4 py-3">Date</th>
              </tr>
            </thead>
            <tbody>
              {files.map((file) => (
                <tr key={file.id} className="border-b last:border-0" style={{ borderColor: "var(--bt-border)" }}>
                  <td className="px-4 py-3">
                    <a href={file.url} target="_blank" rel="noreferrer" className="font-medium text-[var(--bt-primary)] hover:underline">
                      {file.fileName}
                    </a>
                  </td>
                  <td className="px-4 py-3 text-[var(--bt-muted)]">{CATEGORY_LABEL[file.category] ?? file.category}</td>
                  <td className="px-4 py-3 text-[var(--bt-muted)]">{file.uploadedByUser.email}</td>
                  <td className="px-4 py-3 text-[var(--bt-muted)]">{formatDate(file.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
