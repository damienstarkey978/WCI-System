/**
 * Tiny HTML allowlist for Scope of Work / agreement text that may come from the
 * ScopeRichText editor. Strips scripts/styles/event handlers and unknown tags
 * while keeping basic formatting (b/i/u/strong/em/ul/ol/li/p/br/div).
 */
const ALLOWED = new Set(["B", "I", "U", "STRONG", "EM", "UL", "OL", "LI", "P", "BR", "DIV", "SPAN"]);

export function looksLikeHtml(value: string): boolean {
  return /<\/?[a-z][\s\S]*>/i.test(value);
}

export function sanitizeRichTextHtml(html: string): string {
  if (typeof document === "undefined") {
    // Server: strip tags we never want, leave the rest for client render paths that
    // re-sanitize. Prefer escaping when this runs in Node without a DOM.
    return html
      .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
      .replace(/on\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
      .replace(/javascript:/gi, "");
  }

  const template = document.createElement("template");
  template.innerHTML = html;
  const walk = (node: Node) => {
    const children = [...node.childNodes];
    for (const child of children) {
      if (child.nodeType === Node.ELEMENT_NODE) {
        const el = child as HTMLElement;
        if (!ALLOWED.has(el.tagName)) {
          el.replaceWith(...el.childNodes);
          continue;
        }
        for (const attr of [...el.attributes]) {
          if (attr.name.startsWith("on") || attr.name === "href" || attr.name === "src") {
            el.removeAttribute(attr.name);
          }
        }
        walk(el);
      }
    }
  };
  walk(template.content);
  return template.innerHTML;
}

/** Render helper for React — returns { __html } only after sanitizing. */
export function richTextHtmlProp(value: string): { __html: string } {
  return { __html: sanitizeRichTextHtml(value) };
}
