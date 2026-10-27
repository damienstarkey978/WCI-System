import Link from "next/link";

import { AlertIcon, DocumentIcon, VideoIcon } from "@/components/shell/icons";

export interface GalleryFile {
  readonly id: string;
  readonly fileName: string;
  readonly category: string;
  /** Null when the storage object could not be signed (see resolveFileUrlSafe). */
  readonly url: string | null;
}

function GalleryPlaceholder({ file }: { file: GalleryFile }) {
  if (file.url === null) return <AlertIcon className="h-8 w-8" />;
  if (file.category === "VIDEO") return <VideoIcon className="h-8 w-8" />;
  return <DocumentIcon className="h-8 w-8" />;
}

/** Up to four tiles across, the last one showing "+N" when there are more, linking to the log's page. */
export function LogGallery({ files, href }: { files: readonly GalleryFile[]; href: string }) {
  if (files.length === 0) return null;
  const shown = files.slice(0, 4);
  const extra = files.length - shown.length;

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {shown.map((file, index) => {
        const showMore = extra > 0 && index === shown.length - 1;
        return (
          <Link
            key={file.id}
            href={href}
            className="relative block aspect-[4/3] overflow-hidden rounded bg-[var(--bt-page-bg)]"
            title={file.fileName}
          >
            {file.url && file.category === "PHOTO" ? (
              // eslint-disable-next-line @next/next/no-img-element -- signed URLs are short-lived and per-request, not suited to next/image's caching
              <img src={file.url} alt={file.fileName} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-[var(--bt-muted)]">
                <GalleryPlaceholder file={file} />
              </div>
            )}
            {showMore ? <span className="absolute inset-0 flex items-center justify-center bg-black/55 text-2xl font-semibold text-white">+{extra}</span> : null}
          </Link>
        );
      })}
    </div>
  );
}
