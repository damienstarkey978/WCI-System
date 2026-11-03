/**
 * Helpers for Lead Proposals → three-panel estimate workspace navigation.
 * Jarvis sometimes drafts successfully but replies with an apology / notes
 * paragraph that never includes `/leads/estimates/{id}` — callers must also
 * poll the DB. When a path *is* present, prefer the newest match in the thread.
 */

const ESTIMATE_WORKSPACE_PATH = /\/leads\/estimates\/([a-z0-9]+)/gi;
const ESTIMATE_ID_INLINE = /Drafted estimate[^\n]*?\(id:\s*([a-z0-9]+)\)/gi;

export function extractEstimateWorkspaceHref(content: string): string | null {
  const pathMatch = content.match(/\/leads\/estimates\/([a-z0-9]+)/i);
  if (pathMatch?.[1]) return `/leads/estimates/${pathMatch[1]}`;

  const idMatch = content.match(/Drafted estimate[^\n]*?\(id:\s*([a-z0-9]+)\)/i);
  if (idMatch?.[1]) return `/leads/estimates/${idMatch[1]}`;

  return null;
}

/** Newest workspace href across the thread (not only the last assistant bubble). */
export function findEstimateWorkspaceHrefInMessages(
  messages: readonly { readonly role: string; readonly content: string }[],
): string | null {
  let newest: string | null = null;
  for (const message of messages) {
    if (message.role !== "ASSISTANT" && message.role !== "USER") continue;
    const href = extractEstimateWorkspaceHref(message.content);
    if (href) newest = href;
  }

  // Also catch multiple ids in one blob via global regex (side-effect posts).
  if (!newest) {
    for (const message of messages) {
      if (message.role !== "ASSISTANT") continue;
      for (const match of message.content.matchAll(ESTIMATE_WORKSPACE_PATH)) {
        if (match[1]) newest = `/leads/estimates/${match[1]}`;
      }
      for (const match of message.content.matchAll(ESTIMATE_ID_INLINE)) {
        if (match[1]) newest = `/leads/estimates/${match[1]}`;
      }
    }
  }

  return newest;
}

export function isWaitingOnAsyncDraft(messages: readonly { readonly role: string; readonly content: string }[]): boolean {
  const lastAssistant = [...messages].reverse().find((message) => message.role === "ASSISTANT");
  if (!lastAssistant) return false;
  return (
    lastAssistant.content.includes("Queued that up") ||
    lastAssistant.content.includes("I'll post the result right here")
  );
}

export function isAsyncDraftFailureMessage(content: string): boolean {
  return (
    content.includes("I wasn't able to finish drafting that estimate") ||
    content.includes("wasn't able to finish drafting")
  );
}
