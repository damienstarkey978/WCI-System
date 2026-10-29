"use client";

import { useDismissible } from "@/components/shell/use-dismissible";

function DemoMenu({ label }: { label: string }) {
  const { open, setOpen, rootRef } = useDismissible();
  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((value) => !value)}
        className="rounded border bg-white px-3 py-2 text-sm font-medium"
      >
        {label}
      </button>
      {open ? (
        <div role="menu" className="absolute left-0 top-full z-10 mt-1 w-48 rounded border bg-white py-1 shadow">
          <button type="button" role="menuitem" className="block w-full px-3 py-2 text-left text-sm hover:bg-black/5">
            Sample item
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function EscapeMenusFixture() {
  return (
    <div className="flex flex-wrap gap-3">
      <DemoMenu label="Quick add" />
      <DemoMenu label="Notifications" />
      <DemoMenu label="People" />
      <DemoMenu label="Help" />
    </div>
  );
}
