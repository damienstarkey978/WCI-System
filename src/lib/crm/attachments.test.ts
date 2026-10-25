import { describe, expect, it } from "vitest";

import { categoryForMimeType, leadAttachmentPath } from "./attachments";

describe("lead attachments", () => {
  it("files images as pre-sale photos and everything else as documents", () => {
    expect(categoryForMimeType("image/jpeg")).toBe("PRESALE_PHOTO");
    expect(categoryForMimeType("IMAGE/PNG")).toBe("PRESALE_PHOTO");
    expect(categoryForMimeType("application/pdf")).toBe("DOCUMENT");
    expect(categoryForMimeType(null)).toBe("DOCUMENT");
  });

  it("builds a storage path under the lead with a sanitized name", () => {
    expect(leadAttachmentPath({ organizationId: "o1", leadId: "l1", attachmentId: "a1", fileName: "IMG 0094 (1).jpg" })).toBe("o1/leads/l1/a1-IMG_0094__1_.jpg");
  });
});
