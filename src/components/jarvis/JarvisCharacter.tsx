/**
 * The real Jarvis character art (public/jarvis/*.png — five photoreal-style poses
 * supplied for the BUILD_SPEC.md redesign, not an icon or an illustration trace).
 * Distinct from JarvisMascot.tsx, which renders the earlier potrace-traced SVG icon
 * used by the separate, still-independent "fun UI" toggle (src/components/settings/
 * FunUiToggle.tsx) — that toggle is untouched by this redesign and keeps its own
 * character. This component is for the redesign's own hero card, floating launcher,
 * and full-screen chat header, per BUILD_SPEC.md's asset list:
 *
 *   crossed  — default state (dashboard hero, floating button, chat header)
 *   thinking — swapped in while Jarvis is processing/generating a response
 *   pointing — swapped in next to an urgent/alert item
 *   thumbsup — swapped in after a flagged task is completed
 *   waving   — first load of the day / cold open greeting
 */

export type JarvisPose = "crossed" | "thinking" | "pointing" | "thumbsup" | "waving";

const POSE_ALT: Record<JarvisPose, string> = {
  crossed: "Jarvis",
  thinking: "Jarvis, thinking",
  pointing: "Jarvis, pointing at something that needs attention",
  thumbsup: "Jarvis, giving a thumbs up",
  waving: "Jarvis, waving hello",
};

export function JarvisCharacter({
  pose = "crossed",
  width = 118,
  height = 150,
  animated = true,
  className,
}: {
  pose?: JarvisPose;
  width?: number;
  height?: number;
  /** Disable for a static context (e.g. a settings preview) where the float-in +
   *  idle bob would be distracting rather than "alive." */
  animated?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`${animated ? "wci-jarvis-figure" : ""} ${className ?? ""}`}
      style={{ width, height, flexShrink: 0, position: "relative" }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- transparent PNG art, not a next/image-optimizable content image */}
      <img
        src={`/jarvis/${pose}.png`}
        alt={POSE_ALT[pose]}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "contain",
          objectPosition: "bottom",
          filter: "drop-shadow(0 8px 14px rgba(0,0,0,0.5))",
        }}
      />
    </div>
  );
}
