/**
 * Cursor pagination helpers for /api/v1 list endpoints.
 * Keep pages small enough for MCP (~11.8KB truncation) — default limit 25.
 */

export const DEFAULT_LIST_LIMIT = 25;
export const MAX_LIST_LIMIT = 200;

export interface CursorPage<T extends { id: string }> {
  readonly data: T[];
  readonly pagination: {
    readonly nextCursor: string | null;
    readonly hasMore: boolean;
    readonly limit: number;
  };
}

/** `rows` must be fetched with `take: limit + 1` (and optional Prisma cursor). */
export function toCursorPage<T extends { id: string }>(rows: T[], limit: number): CursorPage<T> {
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  return {
    data: page,
    pagination: {
      nextCursor: hasMore ? page[page.length - 1]!.id : null,
      hasMore,
      limit,
    },
  };
}
