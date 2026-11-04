import { describe, expect, it } from "vitest";

import { buildStoredZip, uniqueZipEntryNames } from "./zip-store";

describe("uniqueZipEntryNames", () => {
  it("dedupes colliding file names", () => {
    expect(uniqueZipEntryNames(["a.jpg", "a.jpg", "b.png"])).toEqual(["a.jpg", "a-2.jpg", "b.png"]);
  });
});

describe("buildStoredZip", () => {
  it("builds a recognizable ZIP with local + central headers", () => {
    const bytes = buildStoredZip([
      { name: "one.jpg", bytes: new Uint8Array([1, 2, 3]) },
      { name: "two.png", bytes: new Uint8Array([4, 5]) },
    ]);
    // Local file header signature PK\x03\x04
    expect(Array.from(bytes.slice(0, 4))).toEqual([0x50, 0x4b, 0x03, 0x04]);
    // End of central directory signature PK\x05\x06
    expect(Array.from(bytes.slice(bytes.length - 22, bytes.length - 18))).toEqual([0x50, 0x4b, 0x05, 0x06]);
    const asText = new TextDecoder().decode(bytes);
    expect(asText).toContain("one.jpg");
    expect(asText).toContain("two.png");
  });
});
