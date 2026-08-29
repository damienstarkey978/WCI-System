import { SetupNotice } from "@/app/admin/setup-notice";
import { currentAppUser } from "@/lib/auth";
import { isAnthropicConfigured } from "@/lib/env";

import { ChatInputForm } from "./chat-input-form";
import { ConversationSidebar } from "./conversation-sidebar";
import { MessageList } from "./message-list";

export const dynamic = "force-dynamic";

export default async function JarvisNewChatPage() {
  let user;
  try {
    user = await currentAppUser();
  } catch (error) {
    return <SetupNotice detail={error instanceof Error ? error.message : String(error)} />;
  }
  if (!user) {
    return <SetupNotice detail="No organization found. Seed the database, then reload." />;
  }

  return (
    <div className="flex h-[calc(100vh-3.5rem)]">
      <ConversationSidebar organizationId={user.organizationId} userId={user.id} />
      <div className="flex flex-1 flex-col">
        {!isAnthropicConfigured() ? (
          <div className="m-4 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
            Set <code className="font-mono">ANTHROPIC_API_KEY</code> in <code className="font-mono">.env</code> to
            enable Jarvis.
          </div>
        ) : null}
        <MessageList conversationId="" messages={[]} pendingActions={[]} />
        <ChatInputForm showSuggestions />
      </div>
    </div>
  );
}
