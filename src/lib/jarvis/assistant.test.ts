import { afterEach, describe, expect, it, vi } from "vitest";

import { AiNotConfiguredError, JarvisReplyError, JarvisTurnTimeoutError, runJarvisTurn } from "@/lib/jarvis/assistant";

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

  describe("the internal deadline", () => {
    afterEach(() => {
      delete process.env.JARVIS_TURN_TIMEOUT_MS;
    });

    it(
      "throws a JarvisTurnTimeoutError instead of hanging when the tool runner never resolves",
      async () => {
        process.env.ANTHROPIC_API_KEY = "test-key";
        process.env.JARVIS_TURN_TIMEOUT_MS = "50";
        // Simulates exactly the production symptom: a multi-step tool-calling chain
        // (or a slow nested call like draft_lead_proposal's own estimate drafting)
        // that never resolves within the request's lifetime.
        const neverResolves = vi.fn().mockImplementation(() => new Promise(() => {}));

        const result = runJarvisTurn([{ role: "USER", content: "create a client, a lead, and a proposal" }], [], neverResolves);

        await expect(result).rejects.toBeInstanceOf(JarvisTurnTimeoutError);
        await expect(result).rejects.toBeInstanceOf(JarvisReplyError);
      },
      2_000,
    );

    it("still returns the real reply when the tool runner finishes well within the deadline", async () => {
      process.env.ANTHROPIC_API_KEY = "test-key";
      process.env.JARVIS_TURN_TIMEOUT_MS = "50000";
      const runner = fakeRunner({ stop_reason: "end_turn", content: [{ type: "text", text: "Done." }] });

      const reply = await runJarvisTurn([{ role: "USER", content: "hi" }], [], runner);

      expect(reply).toBe("Done.");
    });
  });
});
