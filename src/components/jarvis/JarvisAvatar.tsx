/**
 * The small circular "face" crop of the Jarvis character art (public/jarvis/*.png)
 * — BUILD_SPEC.md's `.fab-circle`/`.jarvis-chat-avatar` treatment: the same full-body
 * PNG as JarvisCharacter.tsx, but scaled up and shifted so just the face/shoulders
 * fill a circle, for small contexts (the docked launcher button, the chat panel's
 * header avatar) where the full standing figure wouldn't read at that size.
 */

import type { JarvisPose } from "@/components/jarvis/JarvisCharacter";

export function JarvisAvatar({ pose = "crossed", size = 48, className }: { pose?: JarvisPose; size?: number; className?: string }) {
  return (
    <div
      className={className}
      style={{
        width: size,
        height: size,
        borderRadius: "9999px",
        overflow: "hidden",
        flexShrink: 0,
        background: "linear-gradient(160deg, #1b2838, #0b0d10)",
        border: "2px solid var(--bt-border)",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- transparent PNG art, not a next/image-optimizable content image */}
      <img
        src={`/jarvis/${pose}.png`}
        alt="Jarvis"
        style={{
          width: "150%",
          height: "150%",
          objectFit: "cover",
          objectPosition: "20% 10%",
          marginLeft: "-15%",
          marginTop: "-5%",
        }}
      />
    </div>
  );
}
