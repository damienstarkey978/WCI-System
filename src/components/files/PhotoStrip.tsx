export interface PhotoStripFile {
  readonly id: string;
  readonly url: string;
  readonly category: string;
  readonly fileName: string;
}

/** Thumbnail strip for files attached to a single record (a daily log, etc). */
export function PhotoStrip({ files }: { files: readonly PhotoStripFile[] }) {
  if (files.length === 0) return null;

  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {files.map((file) => (
        <a key={file.id} href={file.url} target="_blank" rel="noreferrer" className="block h-16 w-16 overflow-hidden rounded border" style={{ borderColor: "var(--bt-border)" }}>
          {file.category === "PHOTO" ? (
            // eslint-disable-next-line @next/next/no-img-element -- signed URLs are short-lived and per-request, not suited to next/image's caching
            <img src={file.url} alt={file.fileName} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-[var(--bt-page-bg)] text-xl text-[var(--bt-muted)]">
              {file.category === "VIDEO" ? "🎬" : "📄"}
            </div>
          )}
        </a>
      ))}
    </div>
  );
}
