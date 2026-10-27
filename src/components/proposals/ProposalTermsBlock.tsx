/**
 * Renders Damien's canonical proposal Terms & Conditions.
 * Supports the heading / paragraph / italic shapes in wci-proposal-terms.md
 * without inventing a full markdown engine — layout only; wording stays exact.
 */

import type { ReactNode } from "react";

function renderInline(text: string): ReactNode[] {
  const parts: React.ReactNode[] = [];
  const re = /\*([^*]+)\*/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = re.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    parts.push(
      <em key={key++} className="not-italic text-[#4b5563]">
        {match[1]}
      </em>,
    );
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

export function ProposalTermsBlock({ termsText }: { readonly termsText: string }) {
  const blocks = termsText
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean);

  return (
    <section className="mt-8 border-t border-[#e5e7eb] pt-5 break-inside-avoid print:break-before-page">
      <div className="space-y-3 text-[11px] leading-relaxed text-[#4b5563] sm:text-xs">
        {blocks.map((block, index) => {
          const lines = block.split("\n");
          if (lines.length === 1 && lines[0].startsWith("## ")) {
            return (
              <h2 key={index} className="pt-2 text-xs font-semibold uppercase tracking-wide text-[#1a1a1a] sm:text-sm">
                {lines[0].replace(/^##\s+/, "")}
              </h2>
            );
          }
          if (lines.length === 1 && lines[0].startsWith("### ")) {
            return (
              <h3 key={index} className="pt-1 text-[11px] font-semibold text-[#1a1a1a] sm:text-xs">
                {lines[0].replace(/^###\s+/, "")}
              </h3>
            );
          }
          return (
            <div key={index} className="whitespace-pre-wrap">
              {lines.map((line, lineIndex) => {
                if (line.startsWith("### ")) {
                  return (
                    <div key={lineIndex} className="pt-1 font-semibold text-[#1a1a1a]">
                      {line.replace(/^###\s+/, "")}
                    </div>
                  );
                }
                if (line.startsWith("## ")) {
                  return (
                    <div key={lineIndex} className="pt-2 text-xs font-semibold uppercase tracking-wide text-[#1a1a1a]">
                      {line.replace(/^##\s+/, "")}
                    </div>
                  );
                }
                return (
                  <p key={lineIndex} className={lineIndex > 0 ? "mt-1" : undefined}>
                    {renderInline(line)}
                  </p>
                );
              })}
            </div>
          );
        })}
      </div>
    </section>
  );
}
