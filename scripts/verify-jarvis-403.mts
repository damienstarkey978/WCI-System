/**
 * Isolates why Jarvis's Anthropic call returns "403 status code (no body)" while a
 * plain, non-tool-runner call on the same API key succeeds (bill OCR's call worked
 * on this exact production account).
 *
 * The one thing that's actually different between them is the code path:
 * client.beta.messages.toolRunner() (Jarvis) vs client.messages.parse() (bill OCR).
 * This runs three calls, cheapest first, to find exactly where the difference is —
 * the beta namespace itself, the tool-runner specifically, or Jarvis's real 74-tool
 * list — rather than guessing which one matters.
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
//    real call that doesn't require importing Jarvis's whole 74-tool registry.
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

console.log("\nWhichever of these is the FIRST to fail is where the 403 actually comes from.");
