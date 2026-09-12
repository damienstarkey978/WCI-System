/**
 * The same five isolation checks as scripts/verify-jarvis-403.mts, extracted so the
 * in-app admin diagnostics page (src/app/admin/diagnostics) can run them too — from
 * inside the actual deployed server process, using the exact ANTHROPIC_API_KEY and
 * runtime the production Jarvis calls already use. That's a stronger test than
 * running the standalone script from a checked-out repo with its own .env file: it
 * rules out "different environment/key" entirely, and needs no terminal or local
 * checkout — just a click by an admin already signed into the app.
 */
import Anthropic from "@anthropic-ai/sdk";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";

export interface Jarvis403CheckResult {
  readonly label: string;
  readonly ok: boolean;
  readonly detail: string;
}

function detailOf(error: unknown): string {
  if (error instanceof Anthropic.APIError) {
    return `status=${error.status} request_id=${error.requestID ?? "none"} type=${error.type ?? "none"} body=${JSON.stringify(error.error)}`;
  }
  return String(error);
}

async function runCheck(label: string, run: () => PromiseLike<unknown>): Promise<Jarvis403CheckResult> {
  try {
    await run();
    return { label, ok: true, detail: "" };
  } catch (error) {
    return { label, ok: false, detail: detailOf(error) };
  }
}

/** Runs all five isolation checks in order and returns every result — never stops
 *  early, since seeing whether later checks also fail (or start passing) is the
 *  whole point. */
export async function runJarvis403Isolation(): Promise<readonly Jarvis403CheckResult[]> {
  const client = new Anthropic();
  const results: Jarvis403CheckResult[] = [];

  results.push(
    await runCheck("1. plain client.messages.create (non-beta)", () =>
      client.messages.create({ model: "claude-opus-5", max_tokens: 16, messages: [{ role: "user", content: "Reply with one word." }] }),
    ),
  );

  results.push(
    await runCheck("2. client.beta.messages.create, no tools", () =>
      client.beta.messages.create({ model: "claude-opus-5", max_tokens: 16, messages: [{ role: "user", content: "Reply with one word." }] }),
    ),
  );

  results.push(
    await runCheck("3. client.beta.messages.toolRunner, one tool", () => {
      const pingTool = betaZodTool({
        name: "ping",
        description: "Always call this once.",
        inputSchema: z.object({}),
        run: async () => "pong",
      });
      return client.beta.messages.toolRunner({
        model: "claude-opus-5",
        max_tokens: 64,
        tools: [pingTool],
        messages: [{ role: "user", content: "Call the ping tool, then tell me what it returned." }],
      });
    }),
  );

  results.push(
    await runCheck("4. client.beta.messages.toolRunner, ~100 tools", () => {
      const manyTools = Array.from({ length: 100 }, (_, index) =>
        betaZodTool({
          name: `dummy_tool_${index}`,
          description: "A placeholder tool standing in for one of Jarvis's real ~100 tools, to test whether a large tools array specifically triggers the 403.",
          inputSchema: z.object({ note: z.string().optional().describe("Free text") }),
          run: async () => "unused",
        }),
      );
      return client.beta.messages.toolRunner({
        model: "claude-opus-5",
        max_tokens: 64,
        tools: manyTools,
        messages: [{ role: "user", content: "Don't call any tool. Just reply with one word." }],
      });
    }),
  );

  results.push(
    await runCheck("5. client.beta.messages.toolRunner, one tool + an image", () => {
      const pingTool = betaZodTool({
        name: "ping",
        description: "Always call this once.",
        inputSchema: z.object({}),
        run: async () => "pong",
      });
      const onePixelPng =
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
      return client.beta.messages.toolRunner({
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
    }),
  );

  return results;
}
