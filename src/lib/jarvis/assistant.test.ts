import { describe, expect, it, vi } from "vitest";

import { AiNotConfiguredError, JarvisReplyError, runJarvisTurn } from "@/lib/jarvis/assistant";

function fakeRunner(response: unknown) {
  return vi.fn().mockResolvedValue(response);
}

describe("runJarvisTurn", () => {
  it("refuses to run when ANTHROPIC_API_KEY is not set", async () => {
    const original = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      await expect(
        runJarvisTurn([{ role: "USER", content: "hi" }], [], fakeRunner({ stop_reason: "end_turn", content: [{ type: "text", text: "hello" }] })),
      ).rejects.toBeInstanceOf(AiNotConfiguredError);
    } finally {
      if (original !== undefined) process.env.ANTHROPIC_API_KEY = original;
    }
  });

  it("returns the joined text content on success", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    const runner = fakeRunner({ stop_reason: "end_turn", content: [{ type: "text", text: "Here's the answer." }] });

    const reply = await runJarvisTurn([{ role: "USER", content: "What's a change order?" }], [], runner);

    expect(reply).toBe("Here's the answer.");
  });

  it("maps USER/ASSISTANT roles to lowercase, uses claude-opus-5, and forwards the tool list", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    const runner = fakeRunner({ stop_reason: "end_turn", content: [{ type: "text", text: "ok" }] });
    const tools = [{ name: "list_jobs" }] as never;

    await runJarvisTurn(
      [
        { role: "USER", content: "hi" },
        { role: "ASSISTANT", content: "hello" },
      ],
      tools,
      runner,
    );

    const call = runner.mock.calls[0][0];
    expect(call.model).toBe("claude-opus-5");
    expect(call.tools).toEqual(tools);
    expect(call.messages).toEqual([
      { role: "user", content: "hi" },
      { role: "assistant", content: "hello" },
    ]);
  });

  it("throws when the model refuses", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    const runner = fakeRunner({ stop_reason: "refusal", content: [] });

    await expect(runJarvisTurn([{ role: "USER", content: "hi" }], [], runner)).rejects.toBeInstanceOf(JarvisReplyError);
  });

  it("throws when the response has no text content", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    const runner = fakeRunner({ stop_reason: "end_turn", content: [] });

    await expect(runJarvisTurn([{ role: "USER", content: "hi" }], [], runner)).rejects.toBeInstanceOf(JarvisReplyError);
  });
});
