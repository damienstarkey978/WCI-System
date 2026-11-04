/**
 * Minimal ZIP (store / no compression) for bulk photo download.
 * JPGs/PNGs are already compressed; Deflate would buy almost nothing here.
 */

export interface ZipStoreEntry {
  readonly name: string;
  readonly bytes: Uint8Array;
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc ^= bytes[i]!;
    for (let j = 0; j < 8; j++) {
      const mask = -(crc & 1);
      crc = (crc >>> 1) ^ (0xedb88320 & mask);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function u16(value: number): Uint8Array {
  const out = new Uint8Array(2);
  out[0] = value & 0xff;
  out[1] = (value >>> 8) & 0xff;
  return out;
}

function u32(value: number): Uint8Array {
  const out = new Uint8Array(4);
  out[0] = value & 0xff;
  out[1] = (value >>> 8) & 0xff;
  out[2] = (value >>> 16) & 0xff;
  out[3] = (value >>> 24) & 0xff;
  return out;
}

function encodeName(name: string): Uint8Array {
  // ZIP local names are historically CP437; UTF-8 + flag bit 11 is widely supported.
  return new TextEncoder().encode(name.replace(/\\/g, "/").replace(/^\/+/, ""));
}

function concat(chunks: readonly Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, c) => sum + c.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

/** Unique ZIP entry names when several photos share a fileName. */
export function uniqueZipEntryNames(fileNames: readonly string[]): string[] {
  const seen = new Map<string, number>();
  return fileNames.map((raw) => {
    const base = raw.trim() || "photo.jpg";
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    if (count === 0) return base;
    const dot = base.lastIndexOf(".");
    if (dot <= 0) return `${base}-${count + 1}`;
    return `${base.slice(0, dot)}-${count + 1}${base.slice(dot)}`;
  });
}

export function buildStoredZip(entries: readonly ZipStoreEntry[]): Uint8Array {
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = encodeName(entry.name);
    const crc = crc32(entry.bytes);
    const size = entry.bytes.length;
    const flags = 0x0800; // UTF-8 names

    const localHeader = concat([
      u32(0x04034b50),
      u16(20),
      u16(flags),
      u16(0), // store
      u16(0),
      u16(0),
      u32(crc),
      u32(size),
      u32(size),
      u16(nameBytes.length),
      u16(0),
      nameBytes,
    ]);

    localParts.push(localHeader, entry.bytes);

    const centralHeader = concat([
      u32(0x02014b50),
      u16(20),
      u16(20),
      u16(flags),
      u16(0),
      u16(0),
      u16(0),
      u32(crc),
      u32(size),
      u32(size),
      u16(nameBytes.length),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(0),
      u32(offset),
      nameBytes,
    ]);
    centralParts.push(centralHeader);
    offset += localHeader.length + size;
  }

  const central = concat(centralParts);
  const end = concat([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(entries.length),
    u16(entries.length),
    u32(central.length),
    u32(offset),
    u16(0),
  ]);

  return concat([...localParts, central, end]);
}
