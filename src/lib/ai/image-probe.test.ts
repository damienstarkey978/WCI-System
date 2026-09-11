import { describe, expect, it } from "vitest";
import zlib from "node:zlib";

import {
  describeImage,
  imageFingerprint,
  imageInternals,
  probeImage,
  rejectionReason,
  structuralDefect,
} from "@/lib/ai/image-probe";

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

describe("catching files that are structurally broken, not just mislabelled", () => {
  it("accepts a whole PNG", () => {
    expect(structuralDefect(png(300, 160))).toBeNull();
  });

  it("catches a PNG cut off part-way through its pixel data", () => {
    // The exact shape of the inbound-email failure this check was written for: the
    // header still reads 300×160, so every dimension and size check passes.
    const truncated = png(300, 160).subarray(0, 60);
    expect(probeImage(truncated)).toMatchObject({ format: "png", width: 300, height: 160 });
    expect(structuralDefect(truncated)).toMatch(/incomplete/);
    expect(rejectionReason(truncated, "image/png")).toMatch(/incomplete/);
  });

  it("catches a PNG whose bytes were altered in transit", () => {
    const damaged = png(300, 160);
    damaged[40] ^= 0xff;
    expect(structuralDefect(damaged)).toMatch(/checksum|damaged/);
  });

  it("catches a PNG with a header and no end marker", () => {
    const whole = png(300, 160);
    const noEnd = whole.subarray(0, whole.byteLength - 12);
    expect(structuralDefect(noEnd)).toMatch(/incomplete/);
  });

  it("catches a JPEG with no end-of-image marker", () => {
    const jpeg = Buffer.concat([
      Buffer.from("ffd8ffe000104a46494600010100000100010000", "hex"),
      Buffer.alloc(200, 0x11),
    ]);
    expect(structuralDefect(jpeg)).toMatch(/incomplete/);
    expect(structuralDefect(Buffer.concat([jpeg, Buffer.from([0xff, 0xd9])]))).toBeNull();
  });

  it("catches a PDF that never finished uploading", () => {
    expect(structuralDefect(Buffer.from("%PDF-1.7\nstuff"))).toMatch(/incomplete/);
    expect(structuralDefect(Buffer.from("%PDF-1.7\nstuff\n%%EOF\n"))).toBeNull();
  });

  it("fingerprints bytes so the same file can be identified across systems", () => {
    const fingerprint = imageFingerprint(png(300, 160));
    expect(fingerprint).toMatch(/^PNG 300×160, \d+KB, sha256:[0-9a-f]{16}$/);
    expect(imageFingerprint(png(300, 160))).toBe(fingerprint);
    expect(imageFingerprint(png(300, 161))).not.toBe(fingerprint);
  });
});

describe("reporting the encoding details a dimension check cannot see", () => {
  it("reads a PNG's bit depth, colour type, interlacing and section list", () => {
    expect(imageInternals(png(300, 160))).toMatchObject({
      format: "png",
      bitDepth: 8,
      colorType: "2 — truecolour",
      interlaced: false,
    });
    expect(String(imageInternals(png(300, 160)).chunks)).toMatch(/IHDR\(13\).*IDAT\(\d+\).*IEND\(0\)/);
  });

  it("says only the format for anything that isn't a PNG", () => {
    expect(imageInternals(Buffer.from("%PDF-1.7\n%%EOF\n"))).toEqual({ format: "pdf" });
  });
});
