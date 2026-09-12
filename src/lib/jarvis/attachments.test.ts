import { describe, expect, it } from "vitest";

import {
  AttachmentLimitError,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENT_COUNT,
  MAX_TOTAL_ATTACHMENT_BYTES,
  assertAttachmentsWithinLimits,
  attachmentLimitReason,
} from "@/lib/jarvis/attachments";

describe("attachmentLimitReason", () => {
  it("accepts a normal batch of compressed photos", () => {
    // The failure this whole module exists for: 36 real phone photos in one message,
    // which is exactly what this reason-check has to actually accept once they've
    // been through client-side compression.
    const sizes = Array.from({ length: 20 }, () => 300 * 1024);
    expect(attachmentLimitReason(sizes)).toBeNull();
  });

  it("accepts zero attachments", () => {
    expect(attachmentLimitReason([])).toBeNull();
  });

  it("rejects too many photos, naming the count", () => {
    const sizes = Array.from({ length: MAX_ATTACHMENT_COUNT + 1 }, () => 100);
    const reason = attachmentLimitReason(sizes);
    expect(reason).toContain(`${MAX_ATTACHMENT_COUNT + 1} photos`);
    expect(reason).toContain(String(MAX_ATTACHMENT_COUNT));
  });

  it("accepts exactly the count limit", () => {
    const sizes = Array.from({ length: MAX_ATTACHMENT_COUNT }, () => 100);
    expect(attachmentLimitReason(sizes)).toBeNull();
  });

  it("rejects a single oversized photo even when the batch is otherwise fine", () => {
    // This is the case a client that skipped compression produces: one uncompressed
    // phone photo is on its own bigger than Anthropic's own per-image ceiling.
    const sizes = [1024, 1024, MAX_ATTACHMENT_BYTES + 1];
    const reason = attachmentLimitReason(sizes);
    expect(reason).toContain("1 of those photo(s)");
    expect(reason).toContain(`${MAX_ATTACHMENT_BYTES / 1024 / 1024}MB`);
  });

  it("rejects a batch that is fine per-file but too large in total", () => {
    const perFile = MAX_ATTACHMENT_BYTES - 1;
    const count = Math.ceil(MAX_TOTAL_ATTACHMENT_BYTES / perFile) + 1;
    const sizes = Array.from({ length: count }, () => perFile);
    const reason = attachmentLimitReason(sizes);
    expect(reason).toContain("MB of photos altogether");
  });

  it("checks count before total size, so an oversized-batch message doesn't hide a too-many-photos message", () => {
    const sizes = Array.from({ length: MAX_ATTACHMENT_COUNT + 5 }, () => MAX_ATTACHMENT_BYTES + 1);
    expect(attachmentLimitReason(sizes)).toContain("photos —");
  });
});

describe("assertAttachmentsWithinLimits", () => {
  it("does not throw for an acceptable batch", () => {
    expect(() => assertAttachmentsWithinLimits([1024, 2048])).not.toThrow();
  });

  it("throws AttachmentLimitError with the same message attachmentLimitReason gives", () => {
    const sizes = Array.from({ length: MAX_ATTACHMENT_COUNT + 1 }, () => 100);
    expect(() => assertAttachmentsWithinLimits(sizes)).toThrow(AttachmentLimitError);
    try {
      assertAttachmentsWithinLimits(sizes);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(AttachmentLimitError);
      expect((error as Error).message).toBe(attachmentLimitReason(sizes));
    }
  });
});
