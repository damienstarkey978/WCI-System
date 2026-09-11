/**
 * Capture the EXACT bytes the Anthropic SDK puts on the wire for a bill-OCR call.
 *
 * A previous capture proved the arguments we hand the SDK are correct. That is not
 * the same as proving what the SDK sends. This points a real Anthropic client at a
 * local HTTP server and dumps the serialized request body, so the image block is
 * inspected after every layer of SDK transformation, not before.
 */
import http from "node:http";
import zlib from "node:zlib";
import { createHash } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";

import { extractBillFromDocument } from "@/lib/ai/bill-ocr-assistant";

function png(width: number, height: number): Buffer {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const row = y * (width * 3 + 1);
    raw[row] = 0;
    for (let x = 0; x < width; x += 1) {
      const p = row + 1 + x * 3;
      const ink = (x + y) % 37 < 3 ? 0 : 255;
      raw[p] = ink; raw[p + 1] = ink; raw[p + 2] = ink;
    }
  }
  const chunk = (type: string, body: Buffer) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(body.length);
    const td = Buffer.concat([Buffer.from(type, "ascii"), body]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const bodies: string[] = [];
const server = http.createServer((req, res) => {
  const chunks: Buffer[] = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    bodies.push(Buffer.concat(chunks).toString("utf8"));
    res.writeHead(400, { "content-type": "application/json" });
    res.end(JSON.stringify({ type: "error", error: { type: "invalid_request_error", message: "captured" } }));
  });
});

await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = (server.address() as { port: number }).port;

const bytes = png(300, 160);
console.log(`source png: ${bytes.length} bytes  sha256=${createHash("sha256").update(bytes).digest("hex").slice(0, 16)}`);

const client = new Anthropic({ apiKey: "dummy-for-wire-capture", baseURL: `http://127.0.0.1:${port}`, maxRetries: 0 });

try {
  await extractBillFromDocument(
    {
      document: { data: bytes.toString("base64"), mediaType: "image/png" },
      costCodes: [{ id: "cc_1", code: "100", name: "Materials", defaultCostType: "MATERIAL" }],
    },
    client.messages,
  );
} catch (error) {
  // The local server always answers 400 — the capture is the point, not the response.
  console.log("call threw:", error instanceof Error ? `${error.name}: ${error.message}` : String(error));
}
server.close();

if (bodies.length === 0) {
  console.log("NO REQUEST REACHED THE SERVER — the call failed before any HTTP was sent.");
  process.exit(1);
}

const body = JSON.parse(bodies[0]);
const image = body.messages?.[0]?.content?.[0];
console.log("\n--- wire body: top-level keys ---");
console.log(Object.keys(body).join(", "));
console.log("\n--- wire image block ---");
console.log("type:        ", image?.type);
console.log("source.type: ", image?.source?.type);
console.log("media_type:  ", image?.source?.media_type);
const data: string = image?.source?.data ?? "";
console.log("data length: ", data.length);
console.log("has data: prefix?", data.startsWith("data:"));
const decoded = Buffer.from(data, "base64");
console.log("decoded bytes:", decoded.length, "sha256=", createHash("sha256").update(decoded).digest("hex").slice(0, 16));
console.log("byte-identical to source?", decoded.equals(bytes));
console.log("\n--- output_config as sent ---");
console.log(JSON.stringify(body.output_config).slice(0, 400));
console.log("\n--- full body, image data elided ---");
const redacted = JSON.parse(bodies[0]);
redacted.messages[0].content[0].source.data = `<${data.length} base64 chars>`;
console.log(JSON.stringify(redacted, null, 2).slice(0, 3000));
