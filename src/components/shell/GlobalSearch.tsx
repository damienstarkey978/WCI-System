"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import type { SearchResultItem, SearchResults } from "@/lib/search/service";

import { SearchIcon } from "./icons";

const EMPTY: SearchResults = { jobs: [], clients: [], vendors: [], leads: [] };

const GROUPS: readonly { key: keyof SearchResults; label: string }[] = [
  { key: "jobs", label: "Jobs" },
  { key: "clients", label: "Clients" },
  { key: "vendors", label: "Vendors" },
  { key: "leads", label: "Leads" },
];

function ResultRow({ item, onClick }: { item: SearchResultItem; onClick: () => void }) {
  return (
    <Link href={item.href} onClick={onClick} className="flex flex-col px-3 py-2 hover:bg-black/5">
      <span className="text-sm font-medium text-[var(--bt-text)]">{item.label}</span>
      {item.sublabel ? <span className="text-xs text-[var(--bt-muted)]">{item.sublabel}</span> : null}
    </Link>
  );
}

/**
 * The top nav's search box — Buildertrend shows a persistent white pill field
 * (magnifier + "Search") in the bar, not an icon that expands. Jobs, clients,
 * vendors, and leads (src/lib/search/service.ts), scoped server-side to what the
 * signed-in user can see. Debounced fetch to /api/staff/search.
 *
 * On narrow screens the pill collapses to an icon so the nav icon cluster still fits.
 * Pass `variant="pill"` for the centered desktop field, `variant="compact"` for the
 * mobile icon in the right cluster (TopNav mounts each once).
 */
export function GlobalSearch({
  className,
  variant = "pill",
}: {
  className?: string;
  variant?: "pill" | "compact";
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      return;
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      setLoading(true);
      fetch(`/api/staff/search?q=${encodeURIComponent(trimmed)}`, { signal: controller.signal })
        .then((response) => (response.ok ? response.json() : Promise.reject(new Error("search failed"))))
        .then((body: { data: SearchResults }) => setResults(body.data))
        .catch((error) => {
          if (error.name !== "AbortError") setResults(EMPTY);
        })
        .finally(() => setLoading(false));
    }, 200);
    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [query]);

  useEffect(() => {
    if (!mobileOpen) return;
    const timer = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(timer);
  }, [mobileOpen]);

  const hasResults = GROUPS.some((group) => results[group.key].length > 0);
  const showDropdown = focused && query.trim().length >= 2;

  function reset() {
    setQuery("");
    setResults(EMPTY);
  }

  function closeMobile() {
    setMobileOpen(false);
    setFocused(false);
    reset();
  }

  const dropdown = showDropdown ? (
    <div
      className={`absolute top-full z-30 mt-1 w-80 max-w-[calc(100vw-2rem)] rounded-md border border-black/10 bg-[var(--bt-panel-bg)] text-sm text-[var(--bt-text)] shadow-lg ${
        variant === "pill" ? "left-1/2 -translate-x-1/2" : "right-0"
      }`}
    >
      {loading ? (
        <p className="px-3 py-4 text-center text-xs text-[var(--bt-muted)]">Searching…</p>
      ) : !hasResults ? (
        <p className="px-3 py-4 text-center text-xs text-[var(--bt-muted)]">No matches for &quot;{query}&quot;.</p>
      ) : (
        <div className="max-h-96 overflow-y-auto py-1">
          {GROUPS.map((group) =>
            results[group.key].length === 0 ? null : (
              <div key={group.key}>
                <div className="px-3 pt-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--bt-muted)]">{group.label}</div>
                {results[group.key].map((item) => (
                  <ResultRow
                    key={item.id}
                    item={item}
                    onClick={() => {
                      reset();
                      setFocused(false);
                      setMobileOpen(false);
                    }}
                  />
                ))}
              </div>
            ),
          )}
        </div>
      )}
    </div>
  ) : null;

  const pill = (
    <div className="relative w-full">
      <div className="flex h-9 w-full items-center gap-2 rounded-full bg-white px-3 text-[var(--bt-text)] shadow-sm">
        <SearchIcon className="h-4 w-4 shrink-0 text-[var(--bt-muted)]" />
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() =>
            setTimeout(() => {
              setFocused(false);
              if (variant === "compact" && mobileOpen) closeMobile();
            }, 150)
          }
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              reset();
              if (variant === "compact") closeMobile();
              else (event.target as HTMLInputElement).blur();
            }
          }}
          placeholder="Search"
          className="min-w-0 flex-1 bg-transparent text-sm text-[var(--bt-text)] placeholder-[var(--bt-muted)] outline-none"
          aria-label="Search"
        />
      </div>
      {dropdown}
    </div>
  );

  if (variant === "compact") {
    if (!mobileOpen) {
      return (
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className={className ?? "rounded p-2 transition hover:bg-white/10"}
          aria-label="Search"
        >
          <SearchIcon className="h-4.5 w-4.5" />
        </button>
      );
    }
    return <div className={className ?? "w-[min(16rem,calc(100vw-7rem))]"}>{pill}</div>;
  }

  return <div className={className ?? "w-full max-w-md"}>{pill}</div>;
}
