"use client";

/**
 * The docked-everywhere entry point to Jarvis (handoff-ai-analysis-and-jarvis-deep-
 * integration-spec.md Part 3.1) — a floating launcher mounted in AppShell so it's on
 * every authenticated route, opening a slide-over panel instead of navigating to
 * /jarvis. The full /jarvis page still exists for conversation history/search; this
 * is the "don't lose what you were doing" path. The chat itself (message history,
 * composer, context injection) lives in JarvisChatPanel.tsx, shared with any inline
 * embedding of Jarvis on a page (e.g. a Lead's Proposals tab).
 *
 * Automatically attaches a `context` object describing the current route (Part 3.2)
 * so "draft a change order for this" resolves without the user naming the job —
 * see sendJarvisLauncherMessageAction, which folds it into the model's system prompt
 * for that turn and stores it on the message for the audit trail.
 */

import { useState } from "react";
import { usePathname, useParams } from "next/navigation";

import { JarvisChatPanel } from "@/components/jarvis/JarvisChatPanel";
import { JarvisMascot } from "@/components/jarvis/JarvisMascot";
import { useFunUi } from "@/components/jarvis/useFunUi";

function currentPageContext(pathname: string | null, params: Record<string, string | string[] | undefined>): Record<string, unknown> | null {
  if (!pathname || pathname.startsWith("/jarvis")) return null;

  const jobId = typeof params.jobId === "string" ? params.jobId : undefined;
  const leadId = typeof params.leadId === "string" ? params.leadId : undefined;
  const proposalId = typeof params.proposalId === "string" ? params.proposalId : undefined;
  const estimateId = typeof params.estimateId === "string" ? params.estimateId : undefined;
  const vendorId = typeof params.vendorId === "string" ? params.vendorId : undefined;
  const clientId = typeof params.clientId === "string" ? params.clientId : undefined;

  if (jobId) return { page: "job_detail", jobId, path: pathname };
  if (leadId) return { page: "lead_detail", leadId, path: pathname };
  if (proposalId) return { page: "proposal_detail", proposalId, path: pathname };
  if (estimateId) return { page: "estimate_detail", estimateId, path: pathname };
  if (vendorId) return { page: "vendor_detail", vendorId, path: pathname };
  if (clientId) return { page: "client_detail", clientId, path: pathname };
  return { page: "other", path: pathname };
}

export function JarvisLauncher() {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const funUi = useFunUi();

  const pathname = usePathname();
  const rawParams = useParams();
  const context = currentPageContext(pathname, (rawParams ?? {}) as Record<string, string | string[] | undefined>);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label="Ask Jarvis"
        title="Ask Jarvis"
        className={
          funUi
            ? "fixed bottom-5 right-5 z-50 flex h-16 w-16 items-center justify-center rounded-full bg-white p-1.5 shadow-lg transition hover:scale-105"
            : "fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full text-2xl text-white shadow-lg transition hover:scale-105"
        }
        style={funUi ? { border: "2px solid var(--bt-primary)" } : { background: "var(--bt-primary)" }}
      >
        {funUi ? <JarvisMascot expression={pending ? "thinking" : "happy"} size={48} bob={!open} /> : "✦"}
      </button>

      {open ? (
        <div className="fixed bottom-24 right-5 z-50 w-96 max-w-[calc(100vw-2.5rem)] shadow-2xl">
          <JarvisChatPanel
            context={context}
            storageKey="launcher"
            onClose={() => setOpen(false)}
            onPendingChange={setPending}
            heightClassName="h-[32rem]"
          />
        </div>
      ) : null}
    </>
  );
}
