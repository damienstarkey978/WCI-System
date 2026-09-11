/**
 * Reads an image's real format and dimensions from its own header bytes, and checks
 * them against what the vision API will actually accept.
 *
 * This exists because "Could not process image" — the 400 the API returns for an
 * image it won't take — says nothing about *why*, and the same message covers an
 * oversized image, an unusual encoding, and a file that isn't the type it claims.
 * Diagnosing that from a webhook after the fact is guesswork, so the check happens
 * here first and the failure names the actual reason.
 *
 * Header parsing rather than a decoding library: the dimensions live in the first
 * few dozen bytes of every format here, and this is not worth a dependency.
 */

/** Anthropic's documented ceiling for a single image. */
export const MAX_IMAGE_EDGE_PX = 8_000;
/** And its size limit, applied to the raw bytes rather than their base64 expansion. */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export interface ImageFacts {
  readonly format: "png" | "jpeg" | "gif" | "webp" | "pdf" | "unknown";
  readonly width: number | null;
  readonly height: number | null;
}

function readPngSize(bytes: Buffer): { width: number; height: number } | null {
  // IHDR is always the first chunk: 8-byte signature, 4-byte length, "IHDR", then
  // width and height as big-endian uint32.
  if (bytes.byteLength < 24) return null;
  if (bytes.subarray(12, 16).toString("ascii") !== "IHDR") return null;
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

function readJpegSize(bytes: Buffer): { width: number; height: number } | null {
  // Walk the segment chain to the start-of-frame marker, which carries the size.
  let offset = 2;
  while (offset + 9 < bytes.byteLength) {
    if (bytes[offset] !== 0xff) return null;
    const marker = bytes[offset + 1];
    const length = bytes.readUInt16BE(offset + 2);
    // SOF0-SOF15, excluding the non-frame markers that share the range.
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: bytes.readUInt16BE(offset + 5), width: bytes.readUInt16BE(offset + 7) };
    }
    offset += 2 + length;
  }
  return null;
}

function readGifSize(bytes: Buffer): { width: number; height: number } | null {
  if (bytes.byteLength < 10) return null;
  return { width: bytes.readUInt16LE(6), height: bytes.readUInt16LE(8) };
}

function readWebpSize(bytes: Buffer): { width: number; height: number } | null {
  if (bytes.byteLength < 30) return null;
  const kind = bytes.subarray(12, 16).toString("ascii");
  if (kind === "VP8X") return { width: bytes.readUIntLE(24, 3) + 1, height: bytes.readUIntLE(27, 3) + 1 };
  if (kind === "VP8 ") return { width: bytes.readUInt16LE(26) & 0x3fff, height: bytes.readUInt16LE(28) & 0x3fff };
  if (kind === "VP8L") {
    const bits = bytes.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  return null;
}

/** What the bytes actually are, regardless of what the sender called them. */
export function probeImage(bytes: Buffer): ImageFacts {
  const magic = bytes.subarray(0, 8).toString("hex");

  if (magic.startsWith("89504e470d0a1a0a")) {
    const size = readPngSize(bytes);
    return { format: "png", width: size?.width ?? null, height: size?.height ?? null };
  }
  if (magic.startsWith("ffd8ff")) {
    const size = readJpegSize(bytes);
    return { format: "jpeg", width: size?.width ?? null, height: size?.height ?? null };
  }
  if (bytes.subarray(0, 3).toString("ascii") === "GIF") {
    const size = readGifSize(bytes);
    return { format: "gif", width: size?.width ?? null, height: size?.height ?? null };
  }
  if (bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP") {
    const size = readWebpSize(bytes);
    return { format: "webp", width: size?.width ?? null, height: size?.height ?? null };
  }
  if (bytes.subarray(0, 5).toString("ascii") === "%PDF-") {
    return { format: "pdf", width: null, height: null };
  }
  return { format: "unknown", width: null, height: null };
}

const EXPECTED_FORMAT: Record<string, ImageFacts["format"]> = {
  "image/png": "png",
  "image/jpeg": "jpeg",
  "image/gif": "gif",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

/**
 * Returns a plain-language reason the vision API would refuse these bytes, or null
 * if they look acceptable. The message is written for whoever has to act on it —
 * usually someone in the office wondering why a forwarded receipt didn't appear.
 */
export function rejectionReason(bytes: Buffer, claimedContentType: string): string | null {
  if (bytes.byteLength === 0) return "the file is empty";
  if (bytes.byteLength > MAX_IMAGE_BYTES) {
    return `it is ${(bytes.byteLength / 1024 / 1024).toFixed(1)}MB, over the ${MAX_IMAGE_BYTES / 1024 / 1024}MB limit`;
  }

  const facts = probeImage(bytes);
  if (facts.format === "unknown") {
    return `its contents aren't a PNG, JPEG, GIF, WebP or PDF, whatever the sender named it`;
  }

  const expected = EXPECTED_FORMAT[claimedContentType.toLowerCase().split(";")[0].trim()];
  if (expected && facts.format !== expected) {
    // Renaming a file doesn't change it, and mail clients guess content types from
    // extensions — so the bytes are believed over the label.
    return `it is labelled ${claimedContentType} but is actually a ${facts.format.toUpperCase()}`;
  }

  if (facts.width !== null && facts.height !== null) {
    if (facts.width === 0 || facts.height === 0) return "it has no dimensions";
    if (facts.width > MAX_IMAGE_EDGE_PX || facts.height > MAX_IMAGE_EDGE_PX) {
      return `it is ${facts.width}×${facts.height}, and the vision API accepts at most ${MAX_IMAGE_EDGE_PX}px per side — scale it down and resend`;
    }
  }

  return null;
}

/** A short description for logs and audit notes, e.g. "PNG 1200×1600, 271KB". */
export function describeImage(bytes: Buffer): string {
  const facts = probeImage(bytes);
  const size = `${Math.round(bytes.byteLength / 1024)}KB`;
  if (facts.width === null || facts.height === null) return `${facts.format.toUpperCase()}, ${size}`;
  return `${facts.format.toUpperCase()} ${facts.width}×${facts.height}, ${size}`;
}
