/** Wrap-around prev/next for a photo lightbox. Empty list → null. */

export function nextPhotoIndex(current: number, length: number): number | null {
  if (length <= 0) return null;
  if (length === 1) return 0;
  return (current + 1) % length;
}

export function prevPhotoIndex(current: number, length: number): number | null {
  if (length <= 0) return null;
  if (length === 1) return 0;
  return (current - 1 + length) % length;
}
