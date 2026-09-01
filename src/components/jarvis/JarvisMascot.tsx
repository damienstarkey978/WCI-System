/**
 * The traced Jarvis character — public/mascot/*.svg are potrace vector traces of the
 * user's own reference art (not a redraw), recolored to WCI's existing --bt-primary
 * blue. Used wherever Jarvis shows its plain "✦" glyph today, gated behind the
 * fun-UI toggle (src/components/settings/FunUiToggle.tsx) via useFunUi() at each
 * call site — this component itself doesn't check the toggle, so it can also be
 * used in contexts (like the Settings preview) that want it unconditionally.
 */

export type JarvisExpression = "happy" | "thinking" | "analyzing" | "excited" | "helping" | "alert";

const EXPRESSION_LABEL: Record<JarvisExpression, string> = {
  happy: "Jarvis, idle and ready",
  thinking: "Jarvis, thinking",
  analyzing: "Jarvis, analyzing",
  excited: "Jarvis, excited",
  helping: "Jarvis, helping",
  alert: "Jarvis, needs your attention",
};

export function JarvisMascot({
  expression = "happy",
  size = 32,
  bob = false,
  /** "brand" (default) is the WCI-blue trace, for light backgrounds — everywhere
   *  most of the app is. "light" is a white-recolored trace (public/mascot/*-white.svg)
   *  for the fun-UI theme's own colored surfaces (e.g. the chat panel's blue-to-teal
   *  gradient header), where the blue line art would otherwise disappear into a
   *  same-hue background. Ignored when `badge` is set — the badge always uses the
   *  white trace on its own colored circle. */
  tone = "brand",
  /** Wraps the trace in a solid blue-to-teal circle (WCI's own brand colors, not a
   *  new accent) with the white trace on top, instead of placing the bare blue
   *  linework directly on the page. A thin blue outline reads fine on a plain white
   *  card, but on --bt-panel-bg's dark-mode value — or any panel background at all —
   *  it washes out to almost nothing. The badge guarantees contrast regardless of
   *  theme or surrounding surface, and reads as a proper avatar rather than a faint
   *  icon. Use for every standalone Jarvis icon; skip only where the surface itself
   *  is already the same gradient (e.g. the chat panel's own header bar) or already
   *  supplies its own contrasting circle (the docked launcher's white button). */
  badge = false,
  className,
}: {
  expression?: JarvisExpression;
  size?: number;
  /** Subtle up/down idle animation — use for the docked launcher, not for small
   *  inline icons where it'd be distracting. */
  bob?: boolean;
  tone?: "brand" | "light";
  badge?: boolean;
  className?: string;
}) {
  const iconTone = badge ? "light" : tone;
  const img = (
    // eslint-disable-next-line @next/next/no-img-element -- static traced SVG, no need for next/image's optimization pipeline
    <img
      src={`/mascot/${expression}${iconTone === "light" ? "-white" : ""}.svg`}
      alt={EXPRESSION_LABEL[expression]}
      width={badge ? Math.round(size * 0.68) : size}
      height={badge ? Math.round(size * 0.68) : size}
      className={badge ? undefined : className}
      style={bob ? { animation: "wci-mascot-bob 3.4s ease-in-out infinite" } : undefined}
    />
  );

  if (!badge) return img;

  return (
    <span
      className={className}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: size,
        height: size,
        borderRadius: "9999px",
        flexShrink: 0,
        background: "linear-gradient(135deg, var(--bt-primary), var(--bt-nav))",
        boxShadow: "0 3px 10px color-mix(in srgb, var(--bt-primary) 45%, transparent)",
      }}
    >
      {img}
    </span>
  );
}
