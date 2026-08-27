import Link from "next/link";

import { currentPortalSession } from "@/lib/client-portal/browser-session";
import { db } from "@/lib/db";

/**
 * Client Portal shell — deliberately simpler than the staff app-shell
 * (src/components/shell): a client only ever operates within their own jobs,
 * so there is no cross-org nav, just a light top bar and the page content.
 */
export default async function PortalLayout({ children }: LayoutProps<"/portal">) {
  const session = await currentPortalSession();
  const client = session ? await db.client.findUnique({ where: { id: session.clientId }, select: { name: true } }) : null;

  return (
    <div className="flex min-h-screen flex-col" style={{ background: "#f7f8fa" }}>
      <header className="flex h-14 items-center justify-between px-4 text-white" style={{ background: "var(--bt-nav)" }}>
        <Link href="/portal/jobs" className="text-lg font-bold tracking-tight">
          WCI OS <span className="font-normal opacity-80">Client Portal</span>
        </Link>
        {client ? <span className="text-sm">{client.name}</span> : null}
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}
