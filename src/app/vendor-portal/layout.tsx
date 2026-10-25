import Link from "next/link";

import { db } from "@/lib/db";
import { currentVendorPortalSession } from "@/lib/vendor-portal/browser-session";

/** Sub/vendor portal shell — a light top bar and the page, same idea as the client portal. */
export default async function VendorPortalLayout({ children }: LayoutProps<"/vendor-portal">) {
  const session = await currentVendorPortalSession();
  const vendor = session ? await db.vendor.findUnique({ where: { id: session.vendorId }, select: { name: true } }) : null;

  return (
    <div className="flex min-h-screen flex-col" style={{ background: "#f7f8fa" }}>
      <header className="flex h-14 items-center justify-between px-4 text-white" style={{ background: "var(--bt-nav)" }}>
        <Link href="/vendor-portal/jobs" className="text-lg font-bold tracking-tight">
          WCI OS <span className="font-normal opacity-80">Sub Portal</span>
        </Link>
        {vendor ? <span className="text-sm">{vendor.name}</span> : null}
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}
