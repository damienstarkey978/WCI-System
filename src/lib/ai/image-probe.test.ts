import { describe, expect, it } from "vitest";
import zlib from "node:zlib";

import { describeImage, probeImage, rejectionReason } from "@/lib/ai/image-probe";

/** A real, valid PNG of the given size — header parsing needs genuine bytes. */
function png(width: number, height: number): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.byteLength);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32 ? zlib.crc32(body) : 0);
    return Buffer.concat([length, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from("89504e470d0a1a0a", "hex"),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(Buffer.alloc(width * height * 3 + height))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

describe("reading an image's real facts from its bytes", () => {
  it("reads PNG dimensions", () => {
    expect(probeImage(png(1200, 1600))).toMatchObject({ format: "png", width: 1200, height: 1600 });
  });

  it("recognises a PDF", () => {
    expect(probeImage(Buffer.from("%PDF-1.7\nrest")).format).toBe("pdf");
  });

  it("says unknown rather than guessing", () => {
    expect(probeImage(Buffer.from("PK\x03\x04zip")).format).toBe("unknown");
  });

  it("describes a file the way a person would read it", () => {
    expect(describeImage(png(1200, 1600))).toMatch(/^PNG 1200×1600, \d+KB$/);
  });
});

describe("deciding whether the vision API will take it", () => {
  it("accepts an ordinary receipt", () => {
    expect(rejectionReason(png(1200, 1600), "image/png")).toBeNull();
  });

  it("names the dimensions when an image is too big, and says what to do", () => {
    // The likeliest cause of a real "Could not process image": a tall scan.
    const reason = rejectionReason(png(900, 12_000), "image/png");
    expect(reason).toContain("900×12000");
    expect(reason).toContain("8000px");
    expect(reason).toContain("scale it down");
  });

  it("believes the bytes over the label", () => {
    // Mail clients guess content types from extensions, so a PDF named .png is
    // common and should be reported as what it is.
    expect(rejectionReason(Buffer.from("%PDF-1.7\nrest"), "image/png")).toContain("actually a PDF");
  });

  it("rejects something that isn't an image at all", () => {
    expect(rejectionReason(Buffer.from("PK\x03\x04zip"), "image/png")).toContain("aren't a PNG");
  });

  it("rejects an empty attachment", () => {
    expect(rejectionReason(Buffer.alloc(0), "image/png")).toBe("the file is empty");
  });

  it("rejects a file past the size limit before spending an API call on it", () => {
    const huge = Buffer.concat([png(10, 10), Buffer.alloc(6 * 1024 * 1024)]);
    expect(rejectionReason(huge, "image/png")).toContain("over the 5MB limit");
  });
});
