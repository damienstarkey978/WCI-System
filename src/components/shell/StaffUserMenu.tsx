"use client";

/**
 * Staff avatar menu — replaces Clerk's bare UserButton so we can show the WCI
 * User name + role (Heather's #33). Clerk's UserButton only surfaced the email
 * and, when the Clerk profile name was empty, rendered an avatar alt of
 * "'s logo".
 */

import Link from "next/link";
import { useClerk } from "@clerk/nextjs";
import { useEffect, useRef, useState } from "react";

import { BuildingIcon, GearIcon, GlobeIcon } from "./icons";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return (parts[0]?.slice(0, 2) ?? "?").toUpperCase();
  return ((parts[0]?.[0] ?? "") + (parts[parts.length - 1]?.[0] ?? "")).toUpperCase();
}

/** Isolated so `useClerk` is never called when ClerkProvider is not mounted. */
function ClerkSignOutButton({ onDone }: { onDone: () => void }) {
  const { signOut } = useClerk();
  return (
    <button
      type="button"
      role="menuitem"
      onClick={() => {
        onDone();
        void signOut({ redirectUrl: "/sign-in" });
      }}
      className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-black/5"
    >
      Sign out
    </button>
  );
}

export function StaffUserMenu({
  name,
  email,
  roleLabel,
  isAdmin,
  clerkConfigured,
}: {
  name: string;
  email: string;
  roleLabel: string;
  isAdmin: boolean;
  clerkConfigured: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const displayName = name.trim() || email;

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onPointer);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative ml-2">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex max-w-[11rem] items-center gap-2 rounded-full py-0.5 pl-0.5 pr-2 transition hover:bg-white/10 sm:max-w-[14rem]"
        aria-label={`${displayName}, ${roleLabel}`}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold"
          style={{ background: "color-mix(in srgb, white 18%, transparent)", color: "white" }}
          role="img"
          aria-label={`${displayName} avatar`}
        >
          {initials(displayName)}
        </span>
        <span className="hidden min-w-0 flex-col text-left leading-tight sm:flex">
          <span className="truncate text-xs font-semibold text-white">{displayName}</span>
          <span className="truncate text-[10px] text-white/70">{roleLabel}</span>
        </span>
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-full z-40 mt-1 w-64 rounded-md border border-black/10 bg-[var(--bt-panel-bg)] text-sm text-[var(--bt-text)] shadow-lg"
        >
          <div className="border-b px-3 py-2.5" style={{ borderColor: "var(--bt-border)" }}>
            <p className="truncate font-semibold text-[var(--bt-text)]">{displayName}</p>
            <p className="truncate text-xs text-[var(--bt-muted)]">{email}</p>
            <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--bt-muted)]">{roleLabel}</p>
          </div>
          <div className="py-1">
            <Link
              href="/settings"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-3 py-2 hover:bg-black/5"
            >
              <GearIcon className="h-4 w-4" /> Settings
            </Link>
            {isAdmin ? (
              <Link
                href="/settings/company"
                role="menuitem"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 px-3 py-2 hover:bg-black/5"
              >
                <BuildingIcon className="h-4 w-4" /> Company settings
              </Link>
            ) : null}
            <Link
              href="/settings/connections"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-3 py-2 hover:bg-black/5"
            >
              <GlobeIcon className="h-4 w-4" /> Integrations
            </Link>
          </div>
          {clerkConfigured ? (
            <div className="border-t py-1" style={{ borderColor: "var(--bt-border)" }}>
              <ClerkSignOutButton onDone={() => setOpen(false)} />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
