/**
 * Query-string state shared by the three People directories (Internal Users,
 * Subs/Vendors, Client Contacts): page, page size, sort column/direction, and the
 * activation-status filter. Everything lives in the URL so a filtered/sorted view is
 * linkable and survives a reload — these are server-rendered pages with no client
 * state to lose.
 */

export const PAGE_SIZES = [25, 50, 100] as const;
export const DEFAULT_PAGE_SIZE = 50;

export type SortDirection = "asc" | "desc";

export type ActivationFilter = "active" | "pending" | "inactive" | "no-email";

export interface DirectoryParams {
  readonly page: number;
  readonly pageSize: number;
  readonly sort: string | null;
  readonly dir: SortDirection;
  readonly status: ActivationFilter | null;
  readonly query: string;
}

type RawSearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function parseDirectoryParams(raw: RawSearchParams, allowedStatuses: readonly ActivationFilter[]): DirectoryParams {
  const pageSizeRaw = Number(first(raw.pageSize));
  const pageSize = (PAGE_SIZES as readonly number[]).includes(pageSizeRaw) ? pageSizeRaw : DEFAULT_PAGE_SIZE;

  const pageRaw = Math.floor(Number(first(raw.page)));
  const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? pageRaw : 1;

  const statusRaw = first(raw.status);
  const status = allowedStatuses.find((candidate) => candidate === statusRaw) ?? null;

  return {
    page,
    pageSize,
    sort: first(raw.sort) ?? null,
    dir: first(raw.dir) === "desc" ? "desc" : "asc",
    status,
    query: (first(raw.q) ?? "").trim().slice(0, 100),
  };
}

/** Rebuilds a query string from current params, overriding/clearing some — used by every header/pager link. */
export function directoryHref(basePath: string, params: DirectoryParams, overrides: Partial<Record<"page" | "pageSize" | "sort" | "dir" | "status" | "q", string | number | null>>): string {
  const merged: Record<string, string | number | null> = {
    page: params.page,
    pageSize: params.pageSize,
    sort: params.sort,
    dir: params.dir,
    status: params.status,
    q: params.query || null,
    ...overrides,
  };
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(merged)) {
    if (value === null || value === "") continue;
    // Defaults stay out of the URL so a plain /vendors link is the canonical one.
    if (key === "page" && Number(value) === 1) continue;
    if (key === "pageSize" && Number(value) === DEFAULT_PAGE_SIZE) continue;
    if (key === "dir" && value === "asc") continue;
    search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

export function totalPages(totalCount: number, pageSize: number): number {
  return Math.max(1, Math.ceil(totalCount / pageSize));
}
