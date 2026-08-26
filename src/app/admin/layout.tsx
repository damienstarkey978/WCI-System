import Link from "next/link";

/**
 * Internal admin shell. Deliberately plain — Phase 0's UI exists only to verify the
 * data model by hand (CLAUDE.md Phase 0), not to be the real interface.
 */
export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-6 py-8">
      <header className="flex flex-wrap items-baseline justify-between gap-4 border-b border-black/10 pb-4 dark:border-white/15">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          WCI OS <span className="font-normal text-black/50 dark:text-white/50">admin</span>
        </Link>
        <nav className="flex gap-4 text-sm">
          <Link className="hover:underline" href="/admin/jobs">
            Jobs
          </Link>
          <Link className="hover:underline" href="/admin/cost-codes">
            Cost codes
          </Link>
          <Link className="hover:underline" href="/admin/ai-estimate">
            AI Estimate
          </Link>
        </nav>
      </header>
      <main className="flex flex-1 flex-col gap-6">{children}</main>
    </div>
  );
}
