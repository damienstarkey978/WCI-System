import { redirect } from "next/navigation";

import { currentPortalSession } from "@/lib/client-portal/browser-session";

const ERROR_MESSAGE: Record<string, string> = {
  missing_token: "That link is missing its access token.",
  invalid_token: "That link is invalid, expired, or has already been used. Ask your contractor to resend it.",
};

export const dynamic = "force-dynamic";

export default async function PortalHomePage({ searchParams }: PageProps<"/portal">) {
  const session = await currentPortalSession();
  if (session) redirect("/portal/jobs");

  const { error } = await searchParams;
  const message = typeof error === "string" ? ERROR_MESSAGE[error] : undefined;

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 px-6 py-20 text-center">
      <h1 className="text-lg font-semibold text-[var(--bt-text)]">Client Portal</h1>
      <p className="text-sm text-[var(--bt-muted)]">
        Use the portal link emailed to you by your contractor to sign in. Links are single-use and expire after 7 days.
      </p>
      {message ? <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{message}</p> : null}
    </div>
  );
}
