import { redirect } from "next/navigation";

import { currentPortalSession } from "@/lib/client-portal/browser-session";

/**
 * The site's single front door. This is also the PWA manifest's start_url
 * (src/app/manifest.ts) — every "Add to Home Screen" install across the whole site
 * (staff, and now clients too) launches here, so it has to route each visitor to
 * where they actually belong rather than assuming staff. A client's own portal
 * session (a cookie, not a Clerk one — client-portal/vendor-portal users never get
 * Clerk accounts, CLAUDE.md 7) is checked first; everyone else falls through to the
 * staff app under /dashboard, where a signed-out visitor gets bounced to /sign-in by
 * src/proxy.ts's route protection before /dashboard itself ever renders.
 */
export default async function Home() {
  const portalSession = await currentPortalSession();
  if (portalSession) {
    redirect("/portal/jobs");
  }
  redirect("/dashboard");
}
