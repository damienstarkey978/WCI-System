/**
 * Jarvis — the OS-embedded AI assistant (CLAUDE.md's handoff.ai-style AI layer,
 * extended past estimating into a general chat surface). This is the conversational
 * core only: it turns a message history into a reply. It has no tools yet — that's
 * the deliberately separate next increment, where the confirm-on-money-or-client-
 * facing gate (draft freely, confirm before sending an invoice/proposal or recording
 * a payment) actually gets enforced. The system prompt is explicit with the model
 * about that boundary so it never claims to have done something it can't do yet.
 */

import Anthropic from "@anthropic-ai/sdk";

import { isAnthropicConfigured } from "@/lib/env";

export class AiNotConfiguredError extends Error {
  constructor() {
    super("Jarvis is not configured. Set ANTHROPIC_API_KEY to enable it.");
    this.name = "AiNotConfiguredError";
  }
}

export class JarvisReplyError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "JarvisReplyError";
  }
}

const SYSTEM_PROMPT = `You are Jarvis, the AI assistant embedded in World Construction Inc's operating
system (WCI OS) — a Buildertrend-style platform for running residential construction
jobs: estimates and proposals, budgets, purchase orders and bills, invoicing,
scheduling, daily logs, change orders, selections, RFIs, and the client and vendor
portals.

You are talking directly with WCI staff (sales, PMs, admin) inside the OS. Be direct,
concise, and construction-literate — no filler, no over-explaining.

Important boundary: you do not yet have the ability to actually take actions in the
system (you cannot look up a specific job's real data, draft a real change order, or
send a real invoice or proposal on someone's behalf). That capability is coming in a
later update. If someone asks you to do something like that, say plainly that you
can't perform actions yet and explain what you *can* help with right now: answering
general construction/estimating/scheduling questions, thinking through scope of work,
drafting language they can copy in themselves, and so on. Never claim or imply that
you've completed an action you didn't actually perform — that would be actively
misleading in a system that touches real money and real clients.`;

export interface JarvisChatMessage {
  readonly role: "USER" | "ASSISTANT";
  readonly content: string;
}

let cachedClient: Anthropic | null = null;

function getClient(): Anthropic {
  if (!cachedClient) {
    cachedClient = new Anthropic();
  }
  return cachedClient;
}

/**
 * `client` is injectable so callers (and tests) can supply a fake with a
 * `messages.create` method instead of hitting the real API.
 */
export async function replyToConversation(
  messages: readonly JarvisChatMessage[],
  client: Pick<Anthropic["messages"], "create"> = getClient().messages,
): Promise<string> {
  if (!isAnthropicConfigured()) {
    throw new AiNotConfiguredError();
  }

  let response;
  try {
    response = await client.create({
      model: "claude-opus-5",
      max_tokens: 4_096,
      system: SYSTEM_PROMPT,
      messages: messages.map((message) => ({
        role: message.role === "USER" ? ("user" as const) : ("assistant" as const),
        content: message.content,
      })),
    });
  } catch (error) {
    if (error instanceof Anthropic.APIError) {
      throw new JarvisReplyError(`Jarvis couldn't reply: ${error.message}`, { cause: error });
    }
    throw error;
  }

  if (response.stop_reason === "refusal") {
    throw new JarvisReplyError("Jarvis declined to respond to that.");
  }

  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();

  if (!text) {
    throw new JarvisReplyError("Jarvis didn't return a reply.");
  }

  return text;
}
