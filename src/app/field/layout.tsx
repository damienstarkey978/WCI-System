import type { Metadata } from "next";
import Link from "next/link";

import { FieldSyncManager } from "./field-sync-manager";
import { ServiceWorkerRegister } from "./sw-register";

export const metadata: Metadata = {
  title: "WCI OS Field",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "WCI Field" },
};

/**
 * Mobile-first shell for the field PWA (Phase 7) — deliberately separate from
 * /admin's layout, which is desktop office UI. A bottom tab bar rather than a top
 * nav, since this is meant to be installed and used one-handed on a phone at a
 * jobsite, not browsed in a desktop tab.
 */
export default function FieldLayout({ children }: LayoutProps<"/field">) {
  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col">
      <ServiceWorkerRegister />
      <FieldSyncManager />
      <header className="border-b border-black/10 px-4 py-3 dark:border-white/15">
        <Link href="/field" className="text-base font-semibold tracking-tight">
          WCI OS <span className="font-normal text-black/50 dark:text-white/50">field</span>
        </Link>
      </header>
      <main className="flex flex-1 flex-col gap-6 px-4 py-6 pb-24">{children}</main>
      <nav className="fixed inset-x-0 bottom-0 mx-auto flex w-full max-w-md border-t border-black/10 bg-background text-sm dark:border-white/15">
        <Link href="/field" className="flex-1 px-4 py-3 text-center hover:bg-black/5 dark:hover:bg-white/10">
          Home
        </Link>
        <Link href="/field/time-clock" className="flex-1 px-4 py-3 text-center hover:bg-black/5 dark:hover:bg-white/10">
          Time Clock
        </Link>
        <Link href="/field/daily-log" className="flex-1 px-4 py-3 text-center hover:bg-black/5 dark:hover:bg-white/10">
          Daily Log
        </Link>
      </nav>
    </div>
  );
}
