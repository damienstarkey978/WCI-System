"use client";

import { useEffect, useRef } from "react";

/**
 * Lightweight Scope of Work editor — Buildertrend-style B/I/U/list toolbar over a
 * contentEditable surface. Stores HTML in a hidden input named `scopeOfWork`.
 * Only formatting commands that produce simple tags (b/i/u/ul/ol/li) are offered;
 * paste is left as-is and sanitized on the server when rendered.
 */
export function ScopeRichText({
  name = "scopeOfWork",
  defaultValue,
  label = "Scope of Work",
}: {
  name?: string;
  defaultValue: string;
  label?: string;
}) {
  const editorRef = useRef<HTMLDivElement>(null);
  const hiddenRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || editor.dataset.hydrated === "1") return;
    // Plain-text defaults (seeded agreement clause) become a single pre-wrap block.
    if (defaultValue.includes("<") && defaultValue.includes(">")) {
      editor.innerHTML = defaultValue;
    } else {
      editor.textContent = defaultValue;
    }
    editor.dataset.hydrated = "1";
    sync();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- hydrate once from default
  }, []);

  function sync() {
    if (hiddenRef.current && editorRef.current) {
      hiddenRef.current.value = editorRef.current.innerHTML;
    }
  }

  function command(cmd: string) {
    editorRef.current?.focus();
    document.execCommand(cmd, false);
    sync();
  }

  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm font-semibold text-[var(--bt-text)]">{label}</span>
      <div className="overflow-hidden rounded border" style={{ borderColor: "var(--bt-border)" }}>
        <div
          className="flex flex-wrap gap-0.5 border-b bg-black/[0.03] px-1.5 py-1"
          style={{ borderColor: "var(--bt-border)" }}
          role="toolbar"
          aria-label="Formatting"
        >
          <ToolbarButton label="Bold" onClick={() => command("bold")}>
            <span className="font-bold">B</span>
          </ToolbarButton>
          <ToolbarButton label="Italic" onClick={() => command("italic")}>
            <span className="italic">I</span>
          </ToolbarButton>
          <ToolbarButton label="Underline" onClick={() => command("underline")}>
            <span className="underline">U</span>
          </ToolbarButton>
          <span className="mx-1 w-px self-stretch bg-black/10" aria-hidden />
          <ToolbarButton label="Bullet list" onClick={() => command("insertUnorderedList")}>
            • List
          </ToolbarButton>
          <ToolbarButton label="Numbered list" onClick={() => command("insertOrderedList")}>
            1. List
          </ToolbarButton>
        </div>
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-multiline
          aria-label={label}
          onInput={sync}
          onBlur={sync}
          className="min-h-[12rem] max-h-[20rem] overflow-y-auto whitespace-pre-wrap px-3 py-2 text-sm leading-relaxed text-[var(--bt-text)] outline-none focus:ring-1 focus:ring-[var(--bt-primary)]"
        />
      </div>
      <input ref={hiddenRef} type="hidden" name={name} defaultValue={defaultValue} />
    </div>
  );
}

function ToolbarButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onMouseDown={(event) => {
        // Keep selection in the editor.
        event.preventDefault();
        onClick();
      }}
      aria-label={label}
      className="rounded px-2 py-1 text-xs font-semibold text-[var(--bt-text)] hover:bg-black/10"
    >
      {children}
    </button>
  );
}
