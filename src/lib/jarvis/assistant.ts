/**
 * Jarvis — the OS-embedded AI assistant (CLAUDE.md's handoff.ai-style AI layer,
 * extended past estimating into a general chat surface with real tool-calling).
 * The tool registry itself lives in src/lib/jarvis/tools.ts, built per-request from
 * the org/conversation/user context; this file just runs one turn against it.
 *
 * The confirm-gate is structural, not just prompted: a tool with a client-facing or
 * money-moving effect (send_invoice, send_proposal) never performs that effect from
 * inside a tool's run() — it only queues a JarvisPendingAction
 * (src/lib/jarvis/pending-actions.ts), which sits there until a human clicks Confirm.
 * Jarvis's tool loop has no code path that can confirm one itself. The system prompt
 * reinforces this so it never claims an action is done before a human confirms it.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { BetaRunnableTool } from "@anthropic-ai/sdk/lib/tools/BetaRunnableTool";

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

You have tools to look up real data and take real actions in the system. Rules:
- Always look up a job's id via list_jobs before using it in another tool — never
  invent or guess an id.
- Tools that only read data or create an internal-only record (a draft change order,
  a daily log note, an RFI, a to-do) run immediately when you call them.
- Tools that are client-facing or money-moving (sending an invoice or proposal) do
  NOT execute when you call them — they only queue the action for the human to
  confirm in the chat UI. When you call one of these, tell the user it's queued and
  waiting on their confirmation — never say it's been sent or done, because it hasn't.
- WCI OS has no outbound email integration. Nothing "sends an email" — find_job_files
  returns a real link to a file, and the user has to forward it themselves. Never
  claim to have emailed anyone.
- If a tool comes back with "not found" or similar, relay that plainly rather than
  guessing at a fix.
- Never claim or imply you've completed an action you didn't actually perform — that
  would be actively misleading in a system that touches real money and real clients.`;

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

/** Matches BetaToolRunnerParams["tools"], which is itself typed with `any` here for the same
 *  reason: run()'s input and parse()'s output both use the type param, one contravariantly and
 *  one covariantly, so no single non-`any` type lets tools with different input shapes share
 *  an array element type — `unknown`/`never` each break one side of that pair. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- required by BetaRunnableTool's own variance; see comment above
export type JarvisTool = BetaRunnableTool<any>;

interface RunToolTurnParams {
  model: string;
  max_tokens: number;
  system: string;
  tools: JarvisTool[];
  messages: { role: "user" | "assistant"; content: string }[];
}

/** A single non-overloaded function type, so a test fake can just be `vi.fn().mockResolvedValue(...)`. */
export type JarvisToolRunnerFn = (params: RunToolTurnParams) => PromiseLike<Anthropic.Beta.Messages.BetaMessage>;

function defaultToolRunner(params: RunToolTurnParams): PromiseLike<Anthropic.Beta.Messages.BetaMessage> {
  return getClient().beta.messages.toolRunner(params);
}

/**
 * Run one turn of the conversation against the given tools and return Jarvis's final
 * text reply. `runToolTurn` is injectable so callers (and tests) can supply a fake
 * instead of hitting the real API and its tool-calling loop.
 */
export async function runJarvisTurn(
  messages: readonly JarvisChatMessage[],
  tools: readonly JarvisTool[],
  runToolTurn: JarvisToolRunnerFn = defaultToolRunner,
  /** A one-line note on what page/record the user was looking at when they sent the
   *  latest message (from the docked launcher — src/components/jarvis/JarvisLauncher.tsx).
   *  Appended to the system prompt for this turn only; never stored as part of it. */
  contextNote?: string,
): Promise<string> {
  if (!isAnthropicConfigured()) {
    throw new AiNotConfiguredError();
  }

  const system = contextNote ? `${SYSTEM_PROMPT}\n\n${contextNote}` : SYSTEM_PROMPT;

  let finalMessage: Anthropic.Beta.Messages.BetaMessage;
  try {
    finalMessage = await runToolTurn({
      model: "claude-opus-5",
      max_tokens: 4_096,
      system,
      tools: [...tools],
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

  if (finalMessage.stop_reason === "refusal") {
    throw new JarvisReplyError("Jarvis declined to respond to that.");
  }

  const text = finalMessage.content
    .filter((block): block is Anthropic.Beta.Messages.BetaTextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();

  if (!text) {
    throw new JarvisReplyError("Jarvis didn't return a reply.");
  }

  return text;
}
