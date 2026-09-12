/**
 * Limits on photos attached to a Jarvis message, shared by both entry points
 * (src/app/jarvis/actions.ts's two server actions) so the same numbers and the same
 * wording apply everywhere a message can carry images.
 *
 * This exists because of a real failure: sending 36 full-resolution phone photos in
 * one message produced no usable error, just "an unexpected response was received
 * from the server" — Next.js's Server Action body limit (1MB by default) rejects the
 * request before any of our code runs, so there was nothing here to catch it or say
 * why. Client-side compression (src/lib/client/compress-image.ts) is the real fix —
 * it keeps a normal batch of site photos well under any reasonable limit — but a
 * limit still has to exist and has to fail with an answer, because a compressed batch
 * that is still too large, or a client that skips compression, needs the same honest
 * refusal image-probe.ts already gives a single oversized file.
 */

/** Matches Anthropic's per-image ceiling (src/lib/ai/image-probe.ts) so a single huge
 *  photo is refused here with a plain reason instead of failing inside the vision call. */
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;

/**
 * Not a vision-API limit — Claude accepts far more. This is a usability ceiling: past
 * this many photos in one message, what actually helps is multiple focused messages
 * ("here's the kitchen", "here's the bath") rather than one photo dump, and it keeps
 * the request small enough that compression alone is enough to stay well inside any
 * server body-size limit.
 */
export const MAX_ATTACHMENT_COUNT = 30;

/** Total decoded bytes across every photo in one message. */
export const MAX_TOTAL_ATTACHMENT_BYTES = 40 * 1024 * 1024;

export class AttachmentLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AttachmentLimitError";
  }
}

/**
 * Plain-language reason this batch can't be accepted, or null if it's fine — checked
 * against decoded byte sizes so the message matches what someone actually attached
 * rather than an inflated base64 count.
 *
 * Non-throwing so a client component can use it for a cheap, instant check (before
 * spending time compressing 30 photos just to then be told there are too many of
 * them) as well as a final check after compression, without every caller needing a
 * try/catch. Server-side call sites want the throwing form instead, since they
 * already follow a throw-and-catch pattern for every other AI-configuration and
 * validation failure — see assertAttachmentsWithinLimits below.
 */
export function attachmentLimitReason(sizes: readonly number[]): string | null {
  if (sizes.length > MAX_ATTACHMENT_COUNT) {
    return (
      `That's ${sizes.length} photos — Jarvis takes at most ${MAX_ATTACHMENT_COUNT} per message. ` +
      "Split them across a couple of messages (e.g. one room at a time)."
    );
  }

  const oversized = sizes.filter((size) => size > MAX_ATTACHMENT_BYTES);
  if (oversized.length > 0) {
    return (
      `${oversized.length} of those photo(s) are over ${MAX_ATTACHMENT_BYTES / 1024 / 1024}MB. ` +
      "Your browser should have compressed them automatically — try reselecting, or resave them smaller first."
    );
  }

  const total = sizes.reduce((sum, size) => sum + size, 0);
  if (total > MAX_TOTAL_ATTACHMENT_BYTES) {
    return (
      `That's ${(total / 1024 / 1024).toFixed(1)}MB of photos altogether — the limit for one message is ` +
      `${MAX_TOTAL_ATTACHMENT_BYTES / 1024 / 1024}MB. Send them in a couple of messages instead.`
    );
  }

  return null;
}

/** Throws AttachmentLimitError with attachmentLimitReason's message, for server-side
 *  call sites that follow this codebase's usual throw-and-catch validation pattern. */
export function assertAttachmentsWithinLimits(sizes: readonly number[]): void {
  const reason = attachmentLimitReason(sizes);
  if (reason) throw new AttachmentLimitError(reason);
}
