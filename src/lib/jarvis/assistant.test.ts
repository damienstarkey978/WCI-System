import { describe, expect, it, vi } from "vitest";

import { AiNotConfiguredError, JarvisReplyError, replyToConversation } from "@/lib/jarvis/assistant";

function fakeClient(response: unknown) {
  return { create: vi.fn().mockResolvedValue(response) };
}

describe("replyToConversation", () => {
  it("refuses to run when ANTHROPIC_API_KEY is not set", async () => {
    const original = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      await expect(
        replyToConversation([{ role: "USER", content: "hi" }], fakeClient({ stop_reason: "end_turn", content: [{ type: "text", text: "hello" }] })),
      ).rejects.toBeInstanceOf(AiNotConfiguredError);
    } finally {
      if (original !== undefined) process.env.ANTHROPIC_API_KEY = original;
    }
  });

  it("returns the joined text content on success", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    const client = fakeClient({ stop_reason: "end_turn", content: [{ type: "text", text: "Here's the answer." }] });

    const reply = await replyToConversation([{ role: "USER", content: "What's a change order?" }], client);

    expect(reply).toBe("Here's the answer.");
  });

  it("maps USER/ASSISTANT roles to lowercase and uses claude-opus-5", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    const client = fakeClient({ stop_reason: "end_turn", content: [{ type: "text", text: "ok" }] });

    await replyToConversation(
      [
        { role: "USER", content: "hi" },
        { role: "ASSISTANT", content: "hello" },
      ],
      client,
    );

    const call = client.create.mock.calls[0][0];
    expect(call.model).toBe("claude-opus-5");
    expect(call.messages).toEqual([
      { role: "user", content: "hi" },
      { role: "assistant", content: "hello" },
    ]);
  });

  it("throws when the model refuses", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    const client = fakeClient({ stop_reason: "refusal", content: [] });

    await expect(replyToConversation([{ role: "USER", content: "hi" }], client)).rejects.toBeInstanceOf(JarvisReplyError);
  });

  it("throws when the response has no text content", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    const client = fakeClient({ stop_reason: "end_turn", content: [] });

    await expect(replyToConversation([{ role: "USER", content: "hi" }], client)).rejects.toBeInstanceOf(JarvisReplyError);
  });
});
