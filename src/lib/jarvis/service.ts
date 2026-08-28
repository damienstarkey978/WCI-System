/**
 * Database wiring for Jarvis — keeps src/lib/jarvis/assistant.ts free of Prisma so
 * its Claude-calling logic stays unit-testable with a fake client, same split as
 * src/lib/ai/service.ts and src/lib/ai/estimate-assistant.ts.
 */

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

  await db.jarvisMessage.create({ data: { conversationId, role: "USER", content: input.text } });

  const history: JarvisChatMessage[] = [...(conversation?.messages ?? []), { role: "USER", content: input.text }];
  const tools = buildJarvisTools({ organizationId: input.organizationId, conversationId, userId: input.userId });
  const reply = await runJarvisTurn(history, tools);

  await db.jarvisMessage.create({ data: { conversationId, role: "ASSISTANT", content: reply } });
  await db.jarvisConversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } });

  return getConversation(input.organizationId, input.userId, conversationId);
}
