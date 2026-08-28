import { redirect } from "next/navigation";

/**
 * The staff app now lives entirely under /jobs and /dashboard (the
 * Buildertrend-match shell, src/components/shell) — this route is just the
 * front door. Signed-out visitors get bounced to /sign-in by src/proxy.ts's
 * route protection before /dashboard ever renders.
 */
export default function Home() {
  redirect("/dashboard");
}
