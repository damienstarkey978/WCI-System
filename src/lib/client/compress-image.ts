"use client";

/**
 * Downscales and re-encodes a photo in the browser before it ever leaves the device.
 *
 * Built for Jarvis's photo attachments (src/app/jarvis/chat-input-form.tsx,
 * src/components/jarvis/JarvisChatPanel.tsx), where the actual failure was: a real
 * phone camera shoots 3-8MB per photo, and a batch of 30+ of those in one message —
 * exactly the "photograph the whole site, describe the scope, draft a proposal"
 * workflow this feature exists for — blew past Next.js's Server Action body limit
 * before any of our code ran, with nothing to say why.
 *
 * The fix is upstream of any limit: nothing here benefits from full resolution.
 * Claude's own vision guidance tops out its useful resolution around 2576px on the
 * long edge — pixels beyond that cost tokens without adding anything the model can
 * use. Capping below that line turns a multi-megabyte original into a few hundred
 * kilobytes, which is what makes a real batch of site photos fit through the
 * pipeline at all rather than needing an ever-larger body-size limit to chase it.
 */

const MAX_LONG_EDGE_PX = 2048;
const JPEG_QUALITY = 0.82;

/** Left alone: canvas re-encoding flattens an animated GIF to one frame, which is a
 *  worse loss than the bytes it would save on what is already a rare attachment type
 *  for a construction photo. */
const SKIP_RESIZE_TYPES = new Set(["image/gif"]);

/**
 * Returns a new File, resized and re-encoded as JPEG, or the original file when
 * resizing doesn't help or isn't supported — this must never throw, since a failed
 * "optimization" should fall back to sending what the person actually picked rather
 * than blocking them.
 */
export async function compressImageFile(file: File): Promise<File> {
  if (SKIP_RESIZE_TYPES.has(file.type) || typeof createImageBitmap !== "function") {
    return file;
  }

  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const longEdge = Math.max(bitmap.width, bitmap.height);

    // Already small enough — the original is likely already well-compressed (a
    // screenshot, a previously-resized photo), and re-encoding it can only lose
    // quality for no size benefit.
    if (longEdge <= MAX_LONG_EDGE_PX && file.type !== "image/png") {
      bitmap.close();
      return file;
    }

    const scale = Math.min(1, MAX_LONG_EDGE_PX / longEdge);
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) {
      bitmap.close();
      return file;
    }
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
    if (!blob || blob.size >= file.size) {
      // The re-encode didn't help (rare, but possible for an already-tiny or
      // already-JPEG-optimized file) — the original is the better upload.
      return file;
    }

    const newName = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], newName, { type: "image/jpeg", lastModified: file.lastModified });
  } catch {
    // Decoding can fail for a file the browser doesn't actually recognise despite its
    // declared type — send the original and let the same server-side checks that
    // handle every other upload decide whether it's usable.
    return file;
  }
}

/** Runs compressImageFile over a whole batch, in parallel — the browser's own image
 *  decoder is the bottleneck, not anything CPU-bound enough to need serializing. */
export async function compressImageFiles(files: readonly File[]): Promise<File[]> {
  return Promise.all(files.map(compressImageFile));
}
