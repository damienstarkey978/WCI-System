/**
 * Isolates why Jarvis's Anthropic call returns "403 status code (no body)" while a
 * plain, non-tool-runner call on the same API key succeeds (bill OCR's call worked
 * on this exact production account).
 *
 * Update (2026-09-12, from production Netlify logs): this 403 is now confirmed NOT
 * the same thing as the earlier "Jarvis hangs forever" bug — it fires in ~1.8s, a
 * fast direct rejection from Anthropic, not a killed/timed-out connection. A fast
 * 403 with no body most often means an account/key/permission problem rather than
 * something about the request shape — check the ANTHROPIC_API_KEY actually
 * configured for this Netlify function first (valid, not rotated/revoked, has
 * access to claude-opus-5 and to the beta tool-use feature) before assuming it's
 * code. This script still isolates the code-path angle in case it turns out to be
 * request-shape-dependent after all — the closest thing to Jarvis's actual failing
 * call: a toolRunner run with many tool schemas AND a vision (image) content block,
 * in addition to the simpler checks below. Whichever call is the FIRST to fail
 * narrows it down; if ALL of them fail identically, that itself is strong evidence
 * it's the API key/account, not the request.
 */
import Anthropic from "@anthropic-ai/sdk";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";

function report(label: string, ok: boolean, detail: string) {
  console.log(`${ok ? "  ok  " : "FAIL  "} ${label}${detail ? ` — ${detail}` : ""}`);
}

function detailOf(error: unknown): string {
  if (error instanceof Anthropic.APIError) {
    return `status=${error.status} request_id=${error.requestID ?? "none"} type=${error.type ?? "none"} body=${JSON.stringify(error.error)}`;
  }
  return String(error);
}

const client = new Anthropic();

// 1. The plain, non-beta call bill OCR already proved works. A control, run again
//    here so this script's own three results are directly comparable.
try {
  await client.messages.create({
    model: "claude-opus-5",
    max_tokens: 16,
    messages: [{ role: "user", content: "Reply with one word." }],
  });
  report("1. plain client.messages.create (non-beta)", true, "");
} catch (error) {
  report("1. plain client.messages.create (non-beta)", false, detailOf(error));
}

// 2. The beta namespace itself, no tools at all — isolates "beta" as a concept from
//    "tool runner" and from Jarvis's real tool list.
try {
  await client.beta.messages.create({
    model: "claude-opus-5",
    max_tokens: 16,
    messages: [{ role: "user", content: "Reply with one word." }],
  });
  report("2. client.beta.messages.create, no tools", true, "");
} catch (error) {
  report("2. client.beta.messages.create, no tools", false, detailOf(error));
}

// 3. The actual toolRunner, with one trivial tool — the closest thing to Jarvis's
//    real call that doesn't require importing Jarvis's whole tool registry.
try {
  const pingTool = betaZodTool({
    name: "ping",
    description: "Always call this once.",
    inputSchema: z.object({}),
    run: async () => "pong",
  });
  await client.beta.messages.toolRunner({
    model: "claude-opus-5",
    max_tokens: 64,
    tools: [pingTool],
    messages: [{ role: "user", content: "Call the ping tool, then tell me what it returned." }],
  });
  report("3. client.beta.messages.toolRunner, one tool", true, "");
} catch (error) {
  report("3. client.beta.messages.toolRunner, one tool", false, detailOf(error));
}

// 4. toolRunner with a large tool schema payload (~100 dummy tools) — Jarvis's real
//    registry is around that size after recent additions. Isolates "a big tools
//    array specifically" from "tool-calling at all".
try {
  const manyTools = Array.from({ length: 100 }, (_, index) =>
    betaZodTool({
      name: `dummy_tool_${index}`,
      description: `A placeholder tool standing in for one of Jarvis's real ~100 tools, to test whether a large tools array specifically triggers the 403.`,
      inputSchema: z.object({ note: z.string().optional().describe("Free text") }),
      run: async () => "unused",
    }),
  );
  await client.beta.messages.toolRunner({
    model: "claude-opus-5",
    max_tokens: 64,
    tools: manyTools,
    messages: [{ role: "user", content: "Don't call any tool. Just reply with one word." }],
  });
  report("4. client.beta.messages.toolRunner, ~100 tools", true, "");
} catch (error) {
  report("4. client.beta.messages.toolRunner, ~100 tools", false, detailOf(error));
}

// 5. toolRunner with a vision (image) content block — one of the two production
//    repro attempts included a photo attachment; isolates the image-input path.
try {
  const pingTool = betaZodTool({
    name: "ping",
    description: "Always call this once.",
    inputSchema: z.object({}),
    run: async () => "pong",
  });
  // A tiny 1x1 transparent PNG, valid base64 — just needs to be a real image the
  // API will accept, not anything meaningful to look at.
  const onePixelPng =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
  await client.beta.messages.toolRunner({
    model: "claude-opus-5",
    max_tokens: 64,
    tools: [pingTool],
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: "image/png", data: onePixelPng } },
          { type: "text", text: "Call the ping tool, then tell me what it returned." },
        ],
      },
    ],
  });
  report("5. client.beta.messages.toolRunner, one tool + an image", true, "");
} catch (error) {
  report("5. client.beta.messages.toolRunner, one tool + an image", false, detailOf(error));
}

console.log("\nWhichever of these is the FIRST to fail is where the 403 actually comes from.");
console.log("If ALL five fail with the identical status/type/body, that points at the API key or account, not the request shape.");
