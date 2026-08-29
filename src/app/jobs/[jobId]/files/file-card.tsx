"use client";

import { deleteFileAction, updateFileVisibilityAction } from "./actions";

export interface FileCardData {
  readonly id: string;
  readonly fileName: string;
  readonly category: string;
  readonly url: string;
  readonly mimeType: string | null;
  readonly sizeBytes: number | null;
  readonly clientVisible: boolean;
  readonly subVisible: boolean;
  readonly uploaderEmail: string;
  readonly uploadedAt: string;
}

function formatBytes(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function VisibilityToggle({ jobId, fileId, field, checked, label }: { jobId: string; fileId: string; field: "clientVisible" | "subVisible"; checked: boolean; label: string }) {
  return (
    <form action={updateFileVisibilityAction}>
      <input type="hidden" name="jobId" value={jobId} />
      <input type="hidden" name="fileId" value={fileId} />
      <input type="hidden" name="field" value={field} />
      <input type="hidden" name="value" value={String(!checked)} />
      <button
        type="submit"
        className="rounded px-1.5 py-0.5 text-[10px] font-semibold"
        style={checked ? { background: "var(--bt-status-open-bg)", color: "var(--bt-status-open-text)" } : { background: "#e5e7eb", color: "#6b7280" }}
        title={`Toggle ${label.toLowerCase()}`}
      >
        {label}
      </button>
    </form>
  );
}

export function FileCard({ jobId, file }: { jobId: string; file: FileCardData }) {
  const isPhoto = file.category === "PHOTO" || file.category === "PRESALE_PHOTO";

  return (
    <div className="flex flex-col overflow-hidden rounded-lg border bg-[var(--bt-panel-bg)]" style={{ borderColor: "var(--bt-border)" }}>
      <a href={file.url} target="_blank" rel="noreferrer" className="block h-36 bg-[var(--bt-page-bg)]">
        {isPhoto ? (
          // eslint-disable-next-line @next/next/no-img-element -- signed URLs are short-lived and per-request, not suited to next/image's caching
          <img src={file.url} alt={file.fileName} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-4xl text-[var(--bt-muted)]">
            {file.category === "VIDEO" ? "🎬" : "📄"}
          </div>
        )}
      </a>
      <div className="flex flex-1 flex-col gap-1 p-3">
        <a href={file.url} target="_blank" rel="noreferrer" className="truncate text-sm font-medium text-[var(--bt-text)] hover:underline">
          {file.fileName}
        </a>
        <div className="text-xs text-[var(--bt-muted)]">
          {file.uploaderEmail} · {file.uploadedAt}
          {file.sizeBytes ? ` · ${formatBytes(file.sizeBytes)}` : ""}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <VisibilityToggle jobId={jobId} fileId={file.id} field="clientVisible" checked={file.clientVisible} label="Client" />
          <VisibilityToggle jobId={jobId} fileId={file.id} field="subVisible" checked={file.subVisible} label="Sub" />
          <form action={deleteFileAction} className="ml-auto">
            <input type="hidden" name="jobId" value={jobId} />
            <input type="hidden" name="fileId" value={file.id} />
            <button type="submit" className="text-xs font-semibold text-red-600 hover:underline">
              Delete
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
