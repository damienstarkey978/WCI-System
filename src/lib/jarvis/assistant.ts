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

/**
 * A multi-step request (create a client, a lead, AND draft a full proposal from long
 * notes) can chain several Anthropic round trips — including draft_lead_proposal's own
 * tool run() making a second, separate, non-streaming call of its own — inside the one
 * synchronous request/response cycle a Server Action runs in. Left unbounded, that
 * total wall-clock time can exceed the hosting platform's own function execution
 * limit; when that happens the platform kills the function outright, our own code
 * never runs its catch blocks, and the request just hangs with no error at all —
 * confirmed against production (see the bug report this constant was added for).
 *
 * This deadline fires *before* that limit, so runJarvisTurn always gets a chance to
 * throw a real, catchable JarvisReplyError instead. Confirmed against this project's
 * actual Netlify account: the function timeout is 60s flat, not configurable, on
 * every plan — this only covers the Anthropic call itself, though; see
 * src/lib/jarvis/service.ts's getJarvisRequestTimeoutMs for the outer deadline that
 * covers the rest of the request (DB work before and after this call).
 */
/** Read at call time, not module load, so a test (or a future runtime env change) can
 *  override it without needing to re-import the module. */
function getJarvisTurnTimeoutMs(): number {
  return Number(process.env.JARVIS_TURN_TIMEOUT_MS) || 22_000;
}

export class JarvisTurnTimeoutError extends JarvisReplyError {
  constructor(timeoutMs: number) {
    super(
      `Jarvis is taking too long to finish this (over ${Math.round(timeoutMs / 1000)}s). This usually means too much was asked for in one message — ` +
        `e.g. creating a client, a lead, AND drafting a full proposal all at once. Try breaking it into smaller steps: create the client and lead first, ` +
        `then ask Jarvis to draft the proposal separately.`,
    );
    this.name = "JarvisTurnTimeoutError";
  }
}

/**
 * `onTimeout` matters as much as the rejection itself: a bare Promise.race abandons
 * the real in-flight request instead of cancelling it, and in a serverless
 * environment that reuses warm containers between invocations, a dangling promise
 * from a *previous*, already-responded-to request can resolve or reject during a
 * later, unrelated one — a real source of the intermittent "nothing happens at all"
 * reports this deadline exists to prevent in the first place. Passing an
 * AbortController's abort() here (see runJarvisTurn) turns the abandoned request
 * into an actually-cancelled one instead of a merely-ignored one.
 */
export function withDeadline<T>(promise: PromiseLike<T>, timeoutMs: number, onTimeout?: () => void): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      onTimeout?.();
      reject(new JarvisTurnTimeoutError(timeoutMs));
    }, timeoutMs);
    Promise.resolve(promise).then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
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

export type JarvisImageMediaType = "image/jpeg" | "image/png" | "image/webp" | "image/gif";

/** A file attached to the *current* turn only (handoff-ai-analysis-and-jarvis-deep-
 *  integration-spec.md Part 3.4) — never stored in JarvisMessage.content or replayed
 *  on later turns, same "ephemeral vision input" treatment as the AI estimate/daily-
 *  log drafting flows give their own photo uploads. */
export interface JarvisImageInput {
  readonly base64Data: string;
  readonly mediaType: JarvisImageMediaType;
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
  messages: { role: "user" | "assistant"; content: string | Anthropic.Beta.Messages.BetaContentBlockParam[] }[];
}

/** A single non-overloaded function type, so a test fake can just be `vi.fn().mockResolvedValue(...)`.
 *  `signal` is optional so existing test fakes that ignore it keep working unchanged. */
export type JarvisToolRunnerFn = (params: RunToolTurnParams, signal?: AbortSignal) => PromiseLike<Anthropic.Beta.Messages.BetaMessage>;

function defaultToolRunner(params: RunToolTurnParams, signal?: AbortSignal): PromiseLike<Anthropic.Beta.Messages.BetaMessage> {
  return getClient().beta.messages.toolRunner(params, { signal });
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
  /** Photos/images attached to the *latest* message only (Part 3.4's file-grounded
   *  Q&A) — attached as image blocks alongside that message's text. */
  images?: readonly JarvisImageInput[],
): Promise<string> {
  if (!isAnthropicConfigured()) {
    throw new AiNotConfiguredError();
  }

  const system = contextNote ? `${SYSTEM_PROMPT}\n\n${contextNote}` : SYSTEM_PROMPT;
  const lastIndex = messages.length - 1;

  const abortController = new AbortController();
  let finalMessage: Anthropic.Beta.Messages.BetaMessage;
  try {
    finalMessage = await withDeadline(
      runToolTurn(
        {
          model: "claude-opus-5",
          max_tokens: 4_096,
          system,
          tools: [...tools],
          messages: messages.map((message, index) => {
            const role = message.role === "USER" ? ("user" as const) : ("assistant" as const);
            if (index === lastIndex && role === "user" && images && images.length > 0) {
              const imageBlocks: Anthropic.Beta.Messages.BetaContentBlockParam[] = images.map((image) => ({
                type: "image",
                source: { type: "base64", media_type: image.mediaType, data: image.base64Data },
              }));
              return { role, content: [...imageBlocks, { type: "text", text: message.content }] };
            }
            return { role, content: message.content };
          }),
        },
        abortController.signal,
      ),
      getJarvisTurnTimeoutMs(),
      () => abortController.abort(),
    );
  } catch (error) {
    if (error instanceof JarvisTurnTimeoutError) {
      throw error;
    }
    if (error instanceof Anthropic.APIError) {
      // The message shown to a person is deliberately generic — "Jarvis couldn't
      // reply: 403 status code (no body)" says nothing anyone can act on. The
      // request id (when the API even returned one) is the one thing that lets
      // Anthropic support or the Console actually look up what happened, and a
      // bare 403 with no error body is itself informative: Anthropic's own
      // documented error responses always carry a JSON body, so one that doesn't
      // usually means the response never reached their application layer at all —
      // this is logged in full rather than reduced to the SDK's one-line summary.
      console.error("[jarvis] Anthropic API call failed", {
        status: error.status,
        requestId: error.requestID,
        type: error.type,
        errorBody: error.error,
        message: error.message,
      });
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
