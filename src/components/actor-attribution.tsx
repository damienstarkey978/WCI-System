import type { AgentKind } from "@/generated/prisma/enums";
import type { ActorDisplay } from "@/lib/actor";
import { formatActorAttribution } from "@/lib/actor";

/**
 * Compact “who · channel” line for staff timelines and Created-by cells.
 * Channel is always visible so API/bot updates are not mistaken for browser edits.
 */
export function ActorAttribution(props: {
  readonly user?: { readonly name?: string | null; readonly email?: string | null } | null;
  readonly apiKey?: { readonly name?: string | null; readonly agentKind?: AgentKind | null } | null;
  readonly externalLabel?: string | null;
  readonly className?: string;
  /** When true, render only the summary string (no badge chip). */
  readonly compact?: boolean;
}) {
  const resolved = formatActorAttribution({
    user: props.user,
    apiKey: props.apiKey,
    externalLabel: props.externalLabel,
  });

  if (props.compact) {
    return <span className={props.className}>{resolved.summary}</span>;
  }

  return (
    <span className={props.className ?? "inline-flex flex-wrap items-center gap-1.5"}>
      <span>{resolved.label}</span>
      <ActorChannelBadge channel={resolved.channel} label={resolved.channelLabel} />
    </span>
  );
}

export function ActorChannelBadge(props: {
  readonly channel: ActorDisplay["channel"];
  readonly label: string;
}) {
  const tone =
    props.channel === "api"
      ? { border: "var(--bt-primary)", color: "var(--bt-primary)" }
      : { border: "var(--bt-border)", color: "var(--bt-muted)" };

  return (
    <span
      className="rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide"
      style={{ border: `1px solid ${tone.border}`, color: tone.color }}
    >
      {props.label}
    </span>
  );
}

/** Plain-text helper for table cells that cannot mount the badge component. */
export function actorSummaryText(input: {
  readonly user?: { readonly name?: string | null; readonly email?: string | null } | null;
  readonly apiKey?: { readonly name?: string | null } | null;
  readonly externalLabel?: string | null;
}): string {
  return formatActorAttribution(input).summary;
}
