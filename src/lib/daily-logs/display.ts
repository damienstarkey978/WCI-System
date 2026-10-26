/** Display helpers for daily logs, shared by the list and the opened log. */

export function weatherSummary(weather: unknown): { condition: string | null; tempF: number | null } | null {
  if (!weather || typeof weather !== "object") return null;
  const w = weather as Record<string, unknown>;
  const tempF = typeof w.temperatureF === "number" ? Math.round(w.temperatureF) : null;
  const condition = typeof w.condition === "string" ? w.condition : null;
  return tempF === null && condition === null ? null : { condition, tempF };
}

export function logHeading(createdAt: Date, title: string | null): string {
  const day = createdAt.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  return title ? `${day} | ${title}` : day;
}
