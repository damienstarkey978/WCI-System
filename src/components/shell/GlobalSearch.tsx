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
 * The top nav's search box — jobs, clients, vendors, and leads (src/lib/search/service.ts),
 * scoped server-side to what the signed-in user can actually see. Debounced fetch to
 * /api/staff/search rather than a Server Action, since this needs to fire on every
 * keystroke without a full form submission.
 */
export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults>(EMPTY);
  const [loading, setLoading] = useState(false);
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

  const hasResults = GROUPS.some((group) => results[group.key].length > 0);

  function close() {
    setOpen(false);
    setQuery("");
    setResults(EMPTY);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setTimeout(() => inputRef.current?.focus(), 0);
        }}
        className="rounded p-2 transition hover:bg-white/10"
        aria-label="Search"
      >
        <SearchIcon className="h-4.5 w-4.5" />
      </button>
    );
  }

  return (
    <div className="relative">
      <div className="flex items-center gap-1.5 rounded bg-white/10 px-2 py-1.5">
        <SearchIcon className="h-4 w-4 text-white/70" />
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") close();
          }}
          onBlur={() => setTimeout(close, 150)}
          placeholder="Search jobs, clients, vendors, leads…"
          className="w-64 bg-transparent text-sm text-white placeholder-white/50 outline-none"
        />
      </div>
      {query.trim().length >= 2 ? (
        <div className="absolute right-0 top-full z-30 mt-1 w-80 rounded-md border border-black/10 bg-white text-sm text-[var(--bt-text)] shadow-lg">
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
                      <ResultRow key={item.id} item={item} onClick={close} />
                    ))}
                  </div>
                ),
              )}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
