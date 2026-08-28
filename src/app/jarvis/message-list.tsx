export interface JarvisMessageData {
  readonly id: string;
  readonly role: "USER" | "ASSISTANT";
  readonly content: string;
}

export function MessageList({ messages }: { messages: readonly JarvisMessageData[] }) {
  if (messages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-[var(--bt-muted)]">
        Ask Jarvis about scope, estimating, scheduling, or anything else on your mind — it can&apos;t take actions in
        the system yet, but it can talk through the job with you.
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
      {messages.map((message) => (
        <div key={message.id} className={`flex ${message.role === "USER" ? "justify-end" : "justify-start"}`}>
          <div
            className="max-w-[70%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm"
            style={
              message.role === "USER"
                ? { background: "var(--bt-primary)", color: "white" }
                : { background: "#f3f4f6", color: "var(--bt-text)" }
            }
          >
            {message.content}
          </div>
        </div>
      ))}
    </div>
  );
}
