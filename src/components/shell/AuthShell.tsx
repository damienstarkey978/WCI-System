import type { ReactNode } from "react";

/** Buildertrend-match wrapper for the sign-in/sign-up pages — same teal band as TopNav. */
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-1 flex-col" style={{ background: "#f7f8fa" }}>
      <div className="flex h-14 items-center px-6 text-lg font-bold tracking-tight text-white" style={{ background: "var(--bt-nav)" }}>
        WCI OS
      </div>
      <div className="flex flex-1 items-center justify-center px-6 py-16">{children}</div>
    </div>
  );
}

/** Hex twin of --bt-primary (src/app/globals.css) — Clerk's appearance prop can't read CSS custom properties. */
export const CLERK_APPEARANCE = {
  variables: { colorPrimary: "#1a56db" },
} as const;
