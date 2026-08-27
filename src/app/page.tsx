import { redirect } from "next/navigation";

/**
 * The staff app now lives entirely under /jobs (the Buildertrend-match shell,
 * src/components/shell) — this route is just the front door. Signed-out
 * visitors get bounced to /sign-in by src/proxy.ts's route protection before
 * /jobs ever renders.
 */
export default function Home() {
  redirect("/jobs");
}
