import { describe, expect, it } from "vitest";

import { isImageFile, isImageFileName } from "./is-image-file";

describe("isImageFileName", () => {
  it("accepts common photo extensions", () => {
    expect(isImageFileName("slab-1.JPG")).toBe(true);
    expect(isImageFileName("rough.jpeg")).toBe(true);
    expect(isImageFileName("cover.png")).toBe(true);
    expect(isImageFileName("shot.webp")).toBe(true);
  });

  it("rejects PDFs and extensionless names", () => {
    expect(isImageFileName("permit.pdf")).toBe(false);
    expect(isImageFileName("no-extension")).toBe(false);
  });
});

describe("isImageFile", () => {
  it("trusts image mime types", () => {
    expect(isImageFile({ fileName: "x.bin", mimeType: "image/jpeg" })).toBe(true);
  });

  it("keeps PHOTO category images but not PDFs mis-tagged as PHOTO", () => {
    expect(isImageFile({ fileName: "a.jpg", category: "PHOTO" })).toBe(true);
    expect(isImageFile({ fileName: "a.pdf", category: "PHOTO", mimeType: "application/pdf" })).toBe(false);
    expect(isImageFile({ fileName: "a.pdf", category: "PHOTO" })).toBe(false);
  });
});
