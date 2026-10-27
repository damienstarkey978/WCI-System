import Link from "next/link";
import { notFound } from "next/navigation";

import { SetupNotice } from "@/app/admin/setup-notice";
import { CreateModal } from "@/components/shell/CreateModal";
import { EmptyState } from "@/components/shell/EmptyState";
import { FolderIcon, PaperclipIcon, PhotoIcon } from "@/components/shell/icons";
import { PageHeader } from "@/components/shell/PageHeader";
import { currentAppUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { resolveFileUrlSafe } from "@/lib/files/service";
import { listInspectionPictureFolders } from "@/lib/permitting/inspection-pictures";

import { listFolders } from "@/lib/files/folders";

import { deleteFolderAction, purgeFileAction, restoreFileAction, updateFolderVisibilityAction } from "./actions";
import { FileCard } from "./file-card";
import { FolderForm } from "./folder-form";
import { UploadForm } from "./upload-form";

export const dynamic = "force-dynamic";

const CATEGORIES = [
  { value: "DOCUMENT", label: "Documents" },
  { value: "PHOTO", label: "Photos" },
  { value: "VIDEO", label: "Videos" },
  { value: "PRESALE_PHOTO", label: "Pre-Sale Photos" },
  { value: "ALL", label: "All" },
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

  const { category, folder: folderParam, view: viewParam } = await searchParams;
  const trashView = viewParam === "trash";
  // Documents is the landing tab, as in Buildertrend; "All" is an explicit tab.
  const activeCategory = typeof category === "string" && CATEGORIES.some((c) => c.value === category) ? category : "DOCUMENT";

  const folders = await listFolders(user.organizationId, job.id);
  const openAttached = activeCategory === "DOCUMENT" && folderParam === "attached";
  const openFolder =
    activeCategory === "DOCUMENT" && typeof folderParam === "string" && folderParam !== "attached"
      ? (folders.find((f) => f.id === folderParam) ?? null)
      : null;
  const showFolderTable = activeCategory === "DOCUMENT" && openFolder === null && !openAttached;
  // Only needed on the Documents landing table (Inspection Pictures discoverability).
  const inspectionFolders = showFolderTable && !trashView ? await listInspectionPictureFolders(user.organizationId, job.id) : [];
  const inspectionPhotoCount = inspectionFolders.reduce((sum, folder) => sum + folder.photoCount, 0);

  // Buildertrend's "Attached Documents": files that belong to another record (a bill, PO,
  // invoice, selection option or daily log) rather than sitting loose in the job's documents.
  const attachedWhere = { OR: [{ billId: { not: null } }, { purchaseOrderId: { not: null } }, { invoiceId: { not: null } }, { selectionOptionId: { not: null } }, { dailyLogId: { not: null } }] };
  const attachedCount = await db.file.count({ where: { jobId: job.id, deletedAt: null, category: "DOCUMENT", ...attachedWhere } });

  const files = await db.file.findMany({
    where: {
      jobId: job.id,
      deletedAt: trashView ? { not: null } : null,
      ...(trashView
        ? {}
        : openAttached
          ? { category: "DOCUMENT" as const, ...attachedWhere }
          : openFolder
        ? { folderId: openFolder.id }
        : activeCategory === "DOCUMENT"
          ? { category: "DOCUMENT" as const, folderId: null, NOT: attachedWhere }
          : activeCategory !== "ALL"
            ? { category: activeCategory as "PHOTO" | "VIDEO" | "PRESALE_PHOTO" }
            : {}),
    },
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
      uploaderEmail: file.uploadedByUser?.email ?? "Inspector upload",
      uploadedAt: formatDate(file.createdAt),
      folderId: file.folderId,
    })),
  );

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 p-6">
      <PageHeader
        jobName={job.name}
        title="Files"
        action={
          <div className="flex items-center gap-2">
            <Link href={`/jobs/${job.id}/files${trashView ? "" : "?view=trash"}`} className="rounded border px-3 py-2 text-sm font-medium text-[var(--bt-text)]" style={{ borderColor: "var(--bt-border)" }}>
              {trashView ? "Back to files" : "View trash"}
            </Link>
            <CreateModal triggerLabel="+ Upload" title="Upload a file" variant="secondary">
              <UploadForm jobId={job.id} folderId={openFolder?.id} />
            </CreateModal>
            <CreateModal triggerLabel="+ Folder" title="New folder">
              <FolderForm jobId={job.id} />
            </CreateModal>
          </div>
        }
      />

      <nav className="flex gap-1 border-b" style={{ borderColor: "var(--bt-border)" }}>
        {CATEGORIES.map((cat) => (
          <Link
            key={cat.value}
            href={`/jobs/${job.id}/files${cat.value === "DOCUMENT" ? "" : `?category=${cat.value}`}`}
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

      {trashView ? (
        <div className="overflow-hidden rounded-lg border bg-[var(--bt-panel-bg)]" style={{ borderColor: "var(--bt-border)" }}>
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b text-xs font-semibold uppercase tracking-wide text-[var(--bt-muted)]" style={{ borderColor: "var(--bt-border)" }}>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Added</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {filesWithUrls.map((file) => (
                <tr key={file.id} className="border-b last:border-0" style={{ borderColor: "var(--bt-border)" }}>
                  <td className="px-4 py-3 font-medium">{file.fileName}</td>
                  <td className="px-4 py-3 text-[var(--bt-muted)]">{file.category.replace(/_/g, " ").toLowerCase()}</td>
                  <td className="px-4 py-3 text-[var(--bt-muted)]">{file.uploadedAt}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-3">
                      <form action={restoreFileAction}>
                        <input type="hidden" name="jobId" value={job.id} />
                        <input type="hidden" name="fileId" value={file.id} />
                        <button type="submit" className="text-xs font-semibold text-[var(--bt-primary)] hover:underline">
                          Restore
                        </button>
                      </form>
                      <form action={purgeFileAction}>
                        <input type="hidden" name="jobId" value={job.id} />
                        <input type="hidden" name="fileId" value={file.id} />
                        <button type="submit" className="text-xs font-semibold text-red-600 hover:underline">
                          Delete forever
                        </button>
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
              {filesWithUrls.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-[var(--bt-muted)]">
                    The trash is empty.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      ) : null}

      {(openFolder || openAttached) && !trashView ? (
        <div className="flex items-center gap-2 text-sm">
          <Link href={`/jobs/${job.id}/files`} className="font-medium text-[var(--bt-primary)] hover:underline">
            Documents
          </Link>
          <span className="text-[var(--bt-muted)]">/</span>
          <span className="font-semibold text-[var(--bt-text)]">{openAttached ? "Attached Documents" : openFolder?.name}</span>
        </div>
      ) : null}

      {showFolderTable && !trashView ? (
        <div className="overflow-hidden rounded-lg border bg-[var(--bt-panel-bg)]" style={{ borderColor: "var(--bt-border)" }}>
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b text-xs font-semibold uppercase tracking-wide text-[var(--bt-muted)]" style={{ borderColor: "var(--bt-border)" }}>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Shared with</th>
                <th className="px-4 py-3">Modified</th>
                <th className="px-4 py-3">Added</th>
                <th className="px-4 py-3 text-right">Contents</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              <tr className="border-b" style={{ borderColor: "var(--bt-border)" }}>
                <td className="px-4 py-3">
                  <Link
                    href={`/jobs/${job.id}/files/inspection-pictures`}
                    className="inline-flex items-center gap-2 font-medium text-[var(--bt-primary)] hover:underline"
                  >
                    <PhotoIcon className="h-4 w-4 shrink-0 text-[var(--bt-muted)]" />
                    Inspection Pictures
                  </Link>
                </td>
                <td className="px-4 py-3 text-xs text-[var(--bt-muted)]">
                  {inspectionFolders.length === 0
                    ? "Add inspections on Permitting — folders appear here automatically"
                    : `${inspectionFolders.length} inspection folder${inspectionFolders.length === 1 ? "" : "s"}`}
                </td>
                <td className="px-4 py-3" />
                <td className="px-4 py-3" />
                <td className="px-4 py-3 text-right text-[var(--bt-muted)]">{inspectionPhotoCount}</td>
                <td className="px-4 py-3" />
              </tr>
              {attachedCount > 0 ? (
                <tr className="border-b" style={{ borderColor: "var(--bt-border)" }}>
                  <td className="px-4 py-3">
                    <Link
                      href={`/jobs/${job.id}/files?folder=attached`}
                      className="inline-flex items-center gap-2 font-medium text-[var(--bt-primary)] hover:underline"
                    >
                      <PaperclipIcon className="h-4 w-4 shrink-0 text-[var(--bt-muted)]" />
                      Attached Documents
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-xs text-[var(--bt-muted)]">Files on bills, POs, invoices, selections and daily logs</td>
                  <td className="px-4 py-3" />
                  <td className="px-4 py-3" />
                  <td className="px-4 py-3 text-right text-[var(--bt-muted)]">{attachedCount}</td>
                  <td className="px-4 py-3" />
                </tr>
              ) : null}
              {folders.map((folder) => (
                <tr key={folder.id} className="border-b last:border-0" style={{ borderColor: "var(--bt-border)" }}>
                  <td className="px-4 py-3">
                    <Link
                      href={`/jobs/${job.id}/files?folder=${folder.id}`}
                      className="inline-flex items-center gap-2 font-medium text-[var(--bt-primary)] hover:underline"
                    >
                      <FolderIcon className="h-4 w-4 shrink-0 text-[var(--bt-muted)]" />
                      {folder.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1.5">
                      {(["clientVisible", "subVisible"] as const).map((field) => {
                        const on = folder[field];
                        return (
                          <form key={field} action={updateFolderVisibilityAction}>
                            <input type="hidden" name="jobId" value={job.id} />
                            <input type="hidden" name="folderId" value={folder.id} />
                            <input type="hidden" name="field" value={field} />
                            <input type="hidden" name="value" value={String(!on)} />
                            <button
                              type="submit"
                              className="rounded px-1.5 py-0.5 text-[10px] font-semibold"
                              style={on ? { background: "var(--bt-status-open-bg)", color: "var(--bt-status-open-text)" } : { background: "#e5e7eb", color: "#6b7280" }}
                              title="Folder default. Each file keeps its own sharing."
                            >
                              {field === "clientVisible" ? "Client" : "Sub"}
                            </button>
                          </form>
                        );
                      })}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-[var(--bt-muted)]">{formatDate(folder.updatedAt)}</td>
                  <td className="px-4 py-3 text-[var(--bt-muted)]">{formatDate(folder.createdAt)}</td>
                  <td className="px-4 py-3 text-right text-[var(--bt-muted)]">{folder.fileCount}</td>
                  <td className="px-4 py-3 text-right">
                    <form action={deleteFolderAction}>
                      <input type="hidden" name="jobId" value={job.id} />
                      <input type="hidden" name="folderId" value={folder.id} />
                      <button type="submit" className="text-xs text-[var(--bt-muted)] hover:text-red-600 hover:underline" title="Files inside are kept and moved out of the folder">
                        Delete folder
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
              {folders.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-[var(--bt-muted)]">
                    No document folders yet. Use + Folder to add one — Inspection Pictures lives under Files → Inspection Pictures.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      ) : null}

      {showFolderTable && !trashView && filesWithUrls.length > 0 ? <h2 className="text-sm font-semibold text-[var(--bt-text)]">Documents not in a folder</h2> : null}

      {trashView ? null : filesWithUrls.length === 0 && !showFolderTable ? (
        <EmptyState
          icon={activeCategory === "PHOTO" || activeCategory === "PRESALE_PHOTO" ? <PhotoIcon className="h-10 w-10" /> : <FolderIcon className="h-10 w-10" />}
          title="No files yet"
          description="Documents, photos, and videos attached to this job will appear here."
          action={
            <CreateModal triggerLabel="+ Upload" title="Upload a file" variant="secondary">
              <UploadForm jobId={job.id} folderId={openFolder?.id} />
            </CreateModal>
          }
        />
      ) : filesWithUrls.length > 0 ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {filesWithUrls.map((file) => (
            <FileCard key={file.id} jobId={job.id} file={file} folders={folders.map((f) => ({ id: f.id, name: f.name }))} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
