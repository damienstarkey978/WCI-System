import type { ReactNode } from "react";

import { ClerkProvider } from "@clerk/nextjs";

import { isClerkConfigured } from "@/lib/env";

/**
 * Mounts Clerk only when it is configured, so the app still runs locally and in CI
 * without secrets (CLAUDE.md section 7). ClerkProvider throws on a missing publishable
 * key, so this must stay a render-time branch rather than an always-on wrapper.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  if (!isClerkConfigured()) {
    return <>{children}</>;
  }
  return <ClerkProvider>{children}</ClerkProvider>;
}
