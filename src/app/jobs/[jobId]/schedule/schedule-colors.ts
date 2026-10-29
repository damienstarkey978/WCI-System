/** Schedule bar / chip colors — mirrors the Buildertrend Display Color picker. */

export const SCHEDULE_DISPLAY_COLORS = [
  { name: "Olive", hex: "#6B8E23" },
  { name: "Blue", hex: "#2563EB" },
  { name: "Teal", hex: "#0D9488" },
  { name: "Orange", hex: "#EA580C" },
  { name: "Purple", hex: "#7C3AED" },
  { name: "Red", hex: "#DC2626" },
  { name: "Gray", hex: "#6B7280" },
] as const;

const BY_NAME = new Map(SCHEDULE_DISPLAY_COLORS.map((c) => [c.name.toLowerCase(), c.hex]));

/** Resolve a schedule item display color name (or hex) to a CSS color. Defaults to Olive like BT. */
export function scheduleBarColor(displayColor: string | null | undefined): string {
  if (!displayColor) return "#6B8E23";
  const trimmed = displayColor.trim();
  if (trimmed.startsWith("#")) return trimmed;
  return BY_NAME.get(trimmed.toLowerCase()) ?? "#6B8E23";
}
