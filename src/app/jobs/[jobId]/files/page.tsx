import Link from "next/link";
import { notFound } from "next/navigation";

import { SetupNotice } from "@/app/admin/setup-notice";
import { CreateModal } from "@/components/shell/CreateModal";
import { EmptyState } from "@/components/shell/EmptyState";
import { FilterIcon, FolderIcon, PaperclipIcon, PhotoIcon, SearchIcon } from "@/components/shell/icons";
import { PageHeader } from "@/components/shell/PageHeader";
import { currentAppUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { resolveFileUrlsSafe } from "@/lib/files/service";
import { findOrgJobSummary } from "@/lib/jobs/request-job";
import { listInspectionPictureFolders } from "@/lib/permitting/inspection-pictures";

import { listFolders } from "@/lib/files/folders";
import { ensurePresaleDocumentsFolder } from "@/lib/files/presale-documents";

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

/** Cap media / All / trash grids — BT photo migration can leave hundreds per job. */
const FILES_PAGE_SIZE = 48;

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

  const job = await findOrgJobSummary(user.organizationId, jobId);
  if (!job) notFound();

  const { category, folder: folderParam, view: viewParam, page: pageParam, q: qParam } = await searchParams;
  const trashView = viewParam === "trash";
  // Documents is the landing tab, as in Buildertrend; "All" is an explicit tab.
  const activeCategory = typeof category === "string" && CATEGORIES.some((c) => c.value === category) ? category : "DOCUMENT";
  const page = Math.max(1, Number.parseInt(typeof pageParam === "string" ? pageParam : "1", 10) || 1);
  const q = typeof qParam === "string" ? qParam.trim() : "";
  const qLower = q.toLowerCase();

  // Buildertrend's "Attached Documents": files that belong to another record (a bill, PO,
  // invoice, selection option, daily log, or filled permit-package form) rather than sitting
  // loose in the job's documents.
  const attachedWhere = {
    OR: [
      { billId: { not: null } },
      { purchaseOrderId: { not: null } },
      { invoiceId: { not: null } },
      { selectionOptionId: { not: null } },
      { dailyLogId: { not: null } },
      { permitPackageFormId: { not: null } },
    ],
  };

  // BT Documents always includes Pre-Sale Documents — self-heal before listing.
  await ensurePresaleDocumentsFolder(user.organizationId, job.id);

  // Folders needed before we know openFolder — then fan out the rest in parallel.
  const folders = await listFolders(user.organizationId, job.id);
  const openAttached = activeCategory === "DOCUMENT" && folderParam === "attached";
  const openFolder =
    activeCategory === "DOCUMENT" && typeof folderParam === "string" && folderParam !== "attached"
      ? (folders.find((f) => f.id === folderParam) ?? null)
      : null;
  const showFolderTable = activeCategory === "DOCUMENT" && openFolder === null && !openAttached;
  const paginateFiles =
    trashView || openAttached || openFolder != null || activeCategory === "ALL" || activeCategory === "PHOTO" || activeCategory === "VIDEO" || activeCategory === "PRESALE_PHOTO";

  const fileWhere = {
    jobId: job.id,
    deletedAt: trashView ? { not: null } : null,
    ...(q ? { fileName: { contains: q, mode: "insensitive" as const } } : {}),
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
  };

  const [inspectionFolders, attachedCount, totalFiles, files] = await Promise.all([
    showFolderTable && !trashView ? listInspectionPictureFolders(user.organizationId, job.id) : Promise.resolve([]),
    showFolderTable && !trashView
      ? db.file.count({ where: { jobId: job.id, deletedAt: null, category: "DOCUMENT", ...attachedWhere } })
      : Promise.resolve(0),
    paginateFiles ? db.file.count({ where: fileWhere }) : Promise.resolve(0),
    db.file.findMany({
      where: fileWhere,
      orderBy: { createdAt: "desc" },
      ...(paginateFiles ? { skip: (page - 1) * FILES_PAGE_SIZE, take: FILES_PAGE_SIZE } : {}),
      select: {
        id: true,
        fileName: true,
        category: true,
        url: true,
        mimeType: true,
        sizeBytes: true,
        clientVisible: true,
        subVisible: true,
        createdAt: true,
        folderId: true,
        uploadedByUser: { select: { email: true } },
      },
    }),
  ]);
  const inspectionPhotoCount = inspectionFolders.reduce((sum, folder) => sum + folder.photoCount, 0);
  const inspectionFolderIds = new Set(inspectionFolders.map((folder) => folder.folderId));
  // Keep Inspection: * rows under Inspection Pictures only — not duplicated in Documents.
  const documentFolders = folders
    .filter((folder) => !inspectionFolderIds.has(folder.id))
    .filter((folder) => !qLower || folder.name.toLowerCase().includes(qLower));
  const showInspectionRow = !qLower || "inspection pictures".includes(qLower) || qLower.includes("inspection");
  const showAttachedRow = attachedCount > 0 && (!qLower || "attached documents".includes(qLower) || qLower.includes("attached"));
  const pageCount = paginateFiles ? Math.max(1, Math.ceil(totalFiles / FILES_PAGE_SIZE)) : 1;
  const filterCount = q ? 1 : 0;

  // One Supabase createSignedUrls call for the whole grid — not N createSignedUrl.
  const signedUrls = await resolveFileUrlsSafe(files.map((file) => file.url));
  const filesWithUrls = files.map((file, index) => ({
    id: file.id,
    fileName: file.fileName,
    category: file.category,
    url: signedUrls[index] ?? null,
    mimeType: file.mimeType,
    sizeBytes: file.sizeBytes,
    clientVisible: file.clientVisible,
    subVisible: file.subVisible,
    uploaderEmail: file.uploadedByUser?.email ?? "Inspector upload",
    uploadedAt: formatDate(file.createdAt),
    folderId: file.folderId,
  }));

  const filesHref = (nextPage: number) => {
    const params = new URLSearchParams();
    if (activeCategory !== "DOCUMENT") params.set("category", activeCategory);
    if (trashView) params.set("view", "trash");
    if (openAttached) params.set("folder", "attached");
    else if (openFolder) params.set("folder", openFolder.id);
    if (q) params.set("q", q);
    if (nextPage > 1) params.set("page", String(nextPage));
    const qs = params.toString();
    return `/jobs/${job.id}/files${qs ? `?${qs}` : ""}`;
  };

  const categoryHref = (catValue: string, keepSearch = true) => {
    const params = new URLSearchParams();
    if (catValue !== "DOCUMENT") params.set("category", catValue);
    if (keepSearch && q) params.set("q", q);
    const qs = params.toString();
    return `/jobs/${job.id}/files${qs ? `?${qs}` : ""}`;
  };

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-4 sm:p-6">
      <PageHeader
        jobName={job.name}
        title="Files"
        action={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <form action={`/jobs/${job.id}/files`} className="relative hidden sm:block">
              {activeCategory !== "DOCUMENT" ? <input type="hidden" name="category" value={activeCategory} /> : null}
              {trashView ? <input type="hidden" name="view" value="trash" /> : null}
              {openAttached ? <input type="hidden" name="folder" value="attached" /> : null}
              {openFolder ? <input type="hidden" name="folder" value={openFolder.id} /> : null}
              <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--bt-muted)]" />
              <input
                name="q"
                defaultValue={q}
                placeholder="Search"
                aria-label="Search files and folders"
                className="h-9 w-44 rounded border bg-[var(--bt-panel-bg)] pl-8 pr-2 text-sm text-[var(--bt-text)] placeholder:text-[var(--bt-muted)]"
                style={{ borderColor: "var(--bt-border)" }}
              />
            </form>
            {filterCount > 0 ? (
              <Link
                href={categoryHref(activeCategory, false)}
                className="inline-flex h-9 items-center gap-1.5 rounded border bg-[var(--bt-panel-bg)] px-3 text-sm font-medium text-[var(--bt-text)] hover:bg-[var(--bt-panel-bg-muted)]"
                style={{ borderColor: "var(--bt-border)" }}
                title="Clear search"
              >
                <FilterIcon className="h-3.5 w-3.5" />
                Clear
                <span
                  className="inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold text-[var(--bt-on-primary)]"
                  style={{ background: "var(--bt-primary)" }}
                >
                  {filterCount}
                </span>
              </Link>
            ) : (
              <span
                className="inline-flex h-9 items-center gap-1.5 rounded border bg-[var(--bt-panel-bg)] px-3 text-sm font-medium text-[var(--bt-muted)]"
                style={{ borderColor: "var(--bt-border)" }}
                title="Type in Search to filter folders and file names"
              >
                <FilterIcon className="h-3.5 w-3.5" />
                Filter
              </span>
            )}
            <Link
              href={`/jobs/${job.id}/files${trashView ? (q ? `?q=${encodeURIComponent(q)}` : "") : `?view=trash${q ? `&q=${encodeURIComponent(q)}` : ""}`}`}
              className="inline-flex h-9 items-center rounded border bg-[var(--bt-panel-bg)] px-3 text-sm font-medium text-[var(--bt-text)] hover:bg-[var(--bt-panel-bg-muted)]"
              style={{ borderColor: "var(--bt-border)" }}
            >
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

      <nav className="flex gap-1 overflow-x-auto border-b" style={{ borderColor: "var(--bt-border)" }}>
        {CATEGORIES.map((cat) => (
          <Link
            key={cat.value}
            href={categoryHref(cat.value)}
            className="-mb-px shrink-0 border-b-2 px-3 py-2 text-sm font-medium transition"
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
              {showInspectionRow ? (
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
                      ? "Create folders on Inspection Pictures (or add inspections on Permitting)"
                      : `${inspectionFolders.length} inspection folder${inspectionFolders.length === 1 ? "" : "s"}`}
                  </td>
                  <td className="px-4 py-3" />
                  <td className="px-4 py-3" />
                  <td className="px-4 py-3 text-right text-[var(--bt-muted)]">{inspectionPhotoCount}</td>
                  <td className="px-4 py-3" />
                </tr>
              ) : null}
              {showAttachedRow ? (
                <tr className="border-b" style={{ borderColor: "var(--bt-border)" }}>
                  <td className="px-4 py-3">
                    <Link
                      href={`/jobs/${job.id}/files?folder=attached${q ? `&q=${encodeURIComponent(q)}` : ""}`}
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
              {documentFolders.map((folder) => (
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
              {documentFolders.length === 0 ? (
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

      {paginateFiles && pageCount > 1 ? (
        <div className="flex items-center justify-between gap-3 text-sm text-[var(--bt-muted)]">
          <span>
            Page {page} of {pageCount} ({totalFiles} files)
          </span>
          <div className="flex gap-2">
            {page > 1 ? (
              <Link href={filesHref(page - 1)} className="rounded border px-3 py-1.5 font-medium text-[var(--bt-text)]" style={{ borderColor: "var(--bt-border)" }}>
                Previous
              </Link>
            ) : null}
            {page < pageCount ? (
              <Link href={filesHref(page + 1)} className="rounded border px-3 py-1.5 font-medium text-[var(--bt-text)]" style={{ borderColor: "var(--bt-border)" }}>
                Next
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
