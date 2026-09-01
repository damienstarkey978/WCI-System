import { notFound } from "next/navigation";

import { SetupNotice } from "@/app/admin/setup-notice";
import { currentAppUser } from "@/lib/auth";
import { ConversationNotFoundError, getConversation } from "@/lib/jarvis/service";

import { ChatInputForm } from "../chat-input-form";
import { ConversationSidebar } from "../conversation-sidebar";
import { MessageList } from "../message-list";
import { MobileConversationHistory } from "../mobile-conversation-history";

export const dynamic = "force-dynamic";

export default async function JarvisConversationPage({ params }: PageProps<"/jarvis/[conversationId]">) {
  const { conversationId } = await params;

  let user;
  try {
    user = await currentAppUser();
  } catch (error) {
    return <SetupNotice detail={error instanceof Error ? error.message : String(error)} />;
  }
  if (!user) {
    return <SetupNotice detail="No organization found. Seed the database, then reload." />;
  }

  let conversation;
  try {
    conversation = await getConversation(user.organizationId, user.id, conversationId);
  } catch (error) {
    if (error instanceof ConversationNotFoundError) notFound();
    throw error;
  }

  return (
    <div className="flex h-[calc(100vh-3.5rem)] overflow-hidden">
      <ConversationSidebar organizationId={user.organizationId} userId={user.id} activeConversationId={conversation.id} />
      <div className="flex min-h-0 flex-1 flex-col">
        <MobileConversationHistory organizationId={user.organizationId} userId={user.id} activeConversationId={conversation.id} />
        <MessageList
          conversationId={conversation.id}
          messages={conversation.messages}
          pendingActions={conversation.pendingActions}
          userFirstName={user.name?.split(" ")[0]}
        />
        <ChatInputForm conversationId={conversation.id} showSuggestions={conversation.messages.length === 0} />
      </div>
    </div>
  );
}
