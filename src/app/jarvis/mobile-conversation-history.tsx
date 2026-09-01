import { listConversations } from "@/lib/jarvis/service";

import { MobileConversationDrawer } from "./mobile-conversation-drawer";

/**
 * Thin server wrapper so the mobile history trigger can live inside the chat
 * column (as a header bar above the messages) instead of conversation-sidebar.tsx's
 * horizontal row — a second, cheap `listConversations` call rather than threading
 * data across two differently-positioned consumers of one fetch.
 */
export async function MobileConversationHistory({
  organizationId,
  userId,
  activeConversationId,
}: {
  organizationId: string;
  userId: string;
  activeConversationId?: string;
}) {
  const conversations = await listConversations(organizationId, userId);
  return <MobileConversationDrawer conversations={conversations} activeConversationId={activeConversationId} />;
}
