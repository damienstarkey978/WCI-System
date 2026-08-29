/**
 * Database wiring for Jarvis — keeps src/lib/jarvis/assistant.ts free of Prisma so
 * its Claude-calling logic stays unit-testable with a fake client, same split as
 * src/lib/ai/service.ts and src/lib/ai/estimate-assistant.ts.
 */

import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { runJarvisTurn, type JarvisChatMessage } from "@/lib/jarvis/assistant";
import { buildJarvisTools } from "@/lib/jarvis/tools";

export class ConversationNotFoundError extends Error {
  constructor(conversationId: string) {
    super(`Jarvis conversation ${conversationId} not found`);
    this.name = "ConversationNotFoundError";
  }
}

export async function listConversations(organizationId: string, userId: string) {
  return db.jarvisConversation.findMany({
    where: { organizationId, userId },
    orderBy: { updatedAt: "desc" },
    select: { id: true, title: true, updatedAt: true },
  });
}

export async function getConversation(organizationId: string, userId: string, conversationId: string) {
  const conversation = await db.jarvisConversation.findFirst({
    where: { id: conversationId, organizationId, userId },
    include: {
      messages: { orderBy: { createdAt: "asc" } },
      pendingActions: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!conversation) throw new ConversationNotFoundError(conversationId);
  return conversation;
}

function titleFromFirstMessage(text: string): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  return oneLine.length > 60 ? `${oneLine.slice(0, 57)}...` : oneLine;
}

export interface SendJarvisMessageInput {
  readonly organizationId: string;
  readonly userId: string;
  /** Omit to start a new conversation. */
  readonly conversationId?: string;
  readonly text: string;
  /**
   * What page/record the user was looking at when they sent this from the docked
   * launcher (src/components/jarvis/JarvisLauncher.tsx) — e.g.
   * {"page":"job_detail","jobId":"...","jobName":"..."}. Stored on the message for
   * the audit trail and folded into the system prompt for this one turn so "draft a
   * change order for this" resolves without the user naming the job. Omit for
   * messages sent from the full /jarvis page, which has no ambient page to describe.
   */
  readonly context?: unknown;
}

/** A short natural-language note Claude can use to resolve "this"/"here" — never stored. */
function formatContextNote(context: unknown): string | undefined {
  if (!context || typeof context !== "object") return undefined;
  return `The user sent this from the docked launcher while looking at: ${JSON.stringify(context)}. Use it only to resolve which record they mean (e.g. "this job") — don't mention it unless it's relevant to your reply.`;
}

/**
 * Append the user's message, ask Jarvis for a reply against the full thread history,
 * and append that too. Always returns the conversation with every message so the
 * caller can just re-render — no separate "was this a new conversation" branching.
 */
export async function sendJarvisMessage(input: SendJarvisMessageInput) {
  const conversation = input.conversationId
    ? await db.jarvisConversation.findFirst({
        where: { id: input.conversationId, organizationId: input.organizationId, userId: input.userId },
        include: { messages: { orderBy: { createdAt: "asc" } } },
      })
    : null;
  if (input.conversationId && !conversation) throw new ConversationNotFoundError(input.conversationId);

  const conversationId =
    conversation?.id ??
    (
      await db.jarvisConversation.create({
        data: { organizationId: input.organizationId, userId: input.userId, title: titleFromFirstMessage(input.text) },
      })
    ).id;

  await db.jarvisMessage.create({
    data: {
      conversationId,
      role: "USER",
      content: input.text,
      context: input.context ? (input.context as Prisma.InputJsonValue) : undefined,
    },
  });

  const history: JarvisChatMessage[] = [...(conversation?.messages ?? []), { role: "USER", content: input.text }];
  const tools = buildJarvisTools({ organizationId: input.organizationId, conversationId, userId: input.userId });
  const reply = await runJarvisTurn(history, tools, undefined, formatContextNote(input.context));

  await db.jarvisMessage.create({ data: { conversationId, role: "ASSISTANT", content: reply } });
  await db.jarvisConversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } });

  return getConversation(input.organizationId, input.userId, conversationId);
}
