import { describe, expect, it } from "vitest";

import { nextPhotoIndex, prevPhotoIndex } from "./photo-nav";

describe("photo lightbox nav", () => {
  it("returns null for an empty gallery", () => {
    expect(nextPhotoIndex(0, 0)).toBeNull();
    expect(prevPhotoIndex(0, 0)).toBeNull();
  });

  it("stays on the only photo", () => {
    expect(nextPhotoIndex(0, 1)).toBe(0);
    expect(prevPhotoIndex(0, 1)).toBe(0);
  });

  it("wraps around", () => {
    expect(nextPhotoIndex(2, 3)).toBe(0);
    expect(prevPhotoIndex(0, 3)).toBe(2);
    expect(nextPhotoIndex(0, 3)).toBe(1);
    expect(prevPhotoIndex(1, 3)).toBe(0);
  });
});
