import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Default is 1MB, which a single uncompressed phone photo already exceeds —
      // Jarvis's photo attachments (src/app/jarvis/actions.ts) are a real Server
      // Action use case that legitimately needs more. The client compresses photos
      // before upload (src/lib/client/compress-image.ts) so a normal batch is well
      // under this regardless; this is the ceiling for everything else — a client
      // that skipped compression, a future upload path — with src/lib/jarvis/
      // attachments.ts giving the actual usable limit and an explanation once a
      // request is small enough to reach our own code at all.
      bodySizeLimit: "24mb",
    },
  },
};

export default nextConfig;
