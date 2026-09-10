export interface PhotoStripFile {
  readonly id: string;
  /** Null when the file's storage object couldn't be signed — see resolveFileUrlSafe. */
  readonly url: string | null;
  readonly category: string;
  readonly fileName: string;
}

/** Thumbnail strip for files attached to a single record (a daily log, etc). */
export function PhotoStrip({ files }: { files: readonly PhotoStripFile[] }) {
  if (files.length === 0) return null;

  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {files.map((file) =>
        // An unsignable file shows as a placeholder rather than a broken image or,
        // worse, taking the whole page down with it.
        file.url === null ? (
          <div
            key={file.id}
            title={`${file.fileName} — not found in storage`}
            className="flex h-16 w-16 items-center justify-center rounded border text-xl"
            style={{
              borderColor: "var(--bt-border)",
              background: "color-mix(in srgb, var(--bt-hazard) 8%, var(--bt-page-bg))",
            }}
          >
            ⚠️
          </div>
        ) : (
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
        ),
      )}
    </div>
  );
}
