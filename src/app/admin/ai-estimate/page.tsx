import { currentAppUser } from "@/lib/auth";
import { isAnthropicConfigured } from "@/lib/env";
import { db } from "@/lib/db";

import { SetupNotice } from "../setup-notice";
import { AiEstimateForm } from "./ai-estimate-form";

export const dynamic = "force-dynamic";

export default async function AiEstimatePage() {
  let user;
  try {
    user = await currentAppUser();
  } catch (error) {
    return <SetupNotice detail={error instanceof Error ? error.message : String(error)} />;
  }

  if (!user) {
    return <SetupNotice detail="No organization found. Seed the database, then reload." />;
  }

  const jobs = await db.job.findMany({
    where: { organizationId: user.organizationId, isTemplate: false },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true },
    take: 100,
  });

  return (
    <>
      <div>
        <h1 className="text-xl font-semibold tracking-tight">AI Estimate Assistant</h1>
        <p className="mt-1 text-sm text-black/60 dark:text-white/60">
          Draft a line-item estimate from rough field notes — a jobsite walkthrough, a call with the
          homeowner, a voice memo transcript. The draft is created as a normal estimate for review; it is
          never locked or sent to the budget automatically.
        </p>
      </div>

      {!isAnthropicConfigured() ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100">
          Set <code className="font-mono">ANTHROPIC_API_KEY</code> in <code className="font-mono">.env</code>{" "}
          to enable this feature.
        </div>
      ) : null}

      {jobs.length === 0 ? (
        <p className="text-sm text-black/60 dark:text-white/60">Create a job first.</p>
      ) : (
        <AiEstimateForm jobs={jobs} />
      )}
    </>
  );
}
