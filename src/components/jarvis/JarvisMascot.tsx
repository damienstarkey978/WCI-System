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
  className,
}: {
  expression?: JarvisExpression;
  size?: number;
  /** Subtle up/down idle animation — use for the docked launcher, not for small
   *  inline icons where it'd be distracting. */
  bob?: boolean;
  className?: string;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- static traced SVG, no need for next/image's optimization pipeline
    <img
      src={`/mascot/${expression}.svg`}
      alt={EXPRESSION_LABEL[expression]}
      width={size}
      height={size}
      className={className}
      style={bob ? { animation: "wci-mascot-bob 3.4s ease-in-out infinite" } : undefined}
    />
  );
}
