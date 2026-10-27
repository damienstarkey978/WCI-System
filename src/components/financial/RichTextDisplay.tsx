import { looksLikeHtml, sanitizeRichTextHtml } from "@/lib/rich-text";

/**
 * Renders Scope of Work / agreement text that may be plain or lightly formatted HTML
 * from ScopeRichText. Always sanitizes before dangerouslySetInnerHTML.
 */
export function RichTextDisplay({ value, className }: { value: string; className?: string }) {
  if (!looksLikeHtml(value)) {
    return <div className={`whitespace-pre-wrap ${className ?? ""}`.trim()}>{value}</div>;
  }
  return (
    <div
      className={`prose prose-sm max-w-none [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 ${className ?? ""}`.trim()}
      dangerouslySetInnerHTML={{ __html: sanitizeRichTextHtml(value) }}
    />
  );
}
