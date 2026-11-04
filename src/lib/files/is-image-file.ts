/**
 * Whether a file should open in the photo lightbox / count as a gallery image.
 * PDFs and other docs stay out unless they already look like an image by mime or extension.
 */

const IMAGE_MIME = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
]);

const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".heic", ".heif"]);

export function isImageFileName(fileName: string): boolean {
  const lower = fileName.trim().toLowerCase();
  const dot = lower.lastIndexOf(".");
  if (dot < 0) return false;
  return IMAGE_EXT.has(lower.slice(dot));
}

export function isImageFile(input: {
  readonly fileName: string;
  readonly mimeType?: string | null;
  readonly category?: string | null;
}): boolean {
  const mime = input.mimeType?.trim().toLowerCase() ?? "";
  if (mime && IMAGE_MIME.has(mime)) return true;
  if (mime.startsWith("image/")) return true;
  if (input.category === "PHOTO" || input.category === "PRESALE_PHOTO") {
    // Category says photo, but skip obvious non-image attachments mis-tagged as PHOTO.
    if (mime === "application/pdf") return false;
    if (input.fileName.toLowerCase().endsWith(".pdf")) return false;
    return true;
  }
  return isImageFileName(input.fileName);
}
