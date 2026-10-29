/**
 * Buildertrend-match shell icons — hand-drawn SVGs (no icon-library dependency).
 * Stroke weight ~1.5 matches BT’s small nav glyphs; activity icons sit slightly
 * lighter (1.35) so filled accent circles don’t feel heavy.
 */

type IconProps = { className?: string };

const NAV = 1.5;

export function SearchIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <circle cx="8.5" cy="8.5" r="5.25" stroke="currentColor" strokeWidth={NAV} />
      <path d="M16.5 16.5 12.8 12.8" stroke="currentColor" strokeWidth={NAV} strokeLinecap="round" />
    </svg>
  );
}

/** Top-nav notifications — classic bell + clapper (BT metaphor). */
export function BellIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <path
        d="M10 2.75a4.25 4.25 0 0 0-4.25 4.25v2.1c0 .95-.35 1.86-.97 2.57L4 13.25h12l-.78-1.58a4.1 4.1 0 0 1-.97-2.57V7A4.25 4.25 0 0 0 10 2.75Z"
        stroke="currentColor"
        strokeWidth={NAV}
        strokeLinejoin="round"
      />
      <path d="M8 13.5a2 2 0 0 0 4 0" stroke="currentColor" strokeWidth={NAV} strokeLinecap="round" />
      <path d="M10 2.75V2" stroke="currentColor" strokeWidth={NAV} strokeLinecap="round" />
    </svg>
  );
}

/** Top-nav Messages — rounded speech bubble with tail (BT metaphor). */
export function ChatIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <path
        d="M4.2 4.5h11.6A1.7 1.7 0 0 1 17.5 6.2v6.1a1.7 1.7 0 0 1-1.7 1.7H9.2L5.5 16.7v-2.7H4.2A1.7 1.7 0 0 1 2.5 12.3V6.2A1.7 1.7 0 0 1 4.2 4.5Z"
        stroke="currentColor"
        strokeWidth={NAV}
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Top-nav People — two silhouettes (BT metaphor). */
export function PeopleIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <circle cx="7.25" cy="6.75" r="2.4" stroke="currentColor" strokeWidth={NAV} />
      <circle cx="13.75" cy="7.5" r="1.9" stroke="currentColor" strokeWidth={NAV} />
      <path d="M2.75 16.25c.35-2.7 2.2-4.15 4.5-4.15s4.15 1.45 4.5 4.15" stroke="currentColor" strokeWidth={NAV} strokeLinecap="round" />
      <path d="M12.4 12.35c1.75.15 3.15 1.4 3.55 3.9" stroke="currentColor" strokeWidth={NAV} strokeLinecap="round" />
    </svg>
  );
}

export function HelpIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <circle cx="10" cy="10" r="7.25" stroke="currentColor" strokeWidth={NAV} />
      <path
        d="M7.85 8.1a2.15 2.15 0 1 1 3.2 1.85c-.65.4-1.05.85-1.05 1.65"
        stroke="currentColor"
        strokeWidth={NAV}
        strokeLinecap="round"
      />
      <circle cx="10" cy="14.1" r="0.85" fill="currentColor" />
    </svg>
  );
}

export function ChevronDownIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <path d="M5.5 8l4.5 4.5L14.5 8" stroke="currentColor" strokeWidth={NAV} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Buildertrend filter = funnel (not three horizontal lines). */
export function FilterIcon({ className }: IconProps) {
  return <FunnelIcon className={className} />;
}

export function GlobeIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <circle cx="10" cy="10" r="7.25" stroke="currentColor" strokeWidth={NAV} />
      <path
        d="M2.75 10h14.5M10 2.75c2.1 2 3.15 4.55 3.15 7.25S12.1 15.25 10 17.25C7.9 15.25 6.85 12.7 6.85 10S7.9 4.75 10 2.75Z"
        stroke="currentColor"
        strokeWidth={NAV}
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Dual-column sort (asc on left, desc on right) — BT list-toolbar metaphor. */
export function SortIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <path d="M6.5 4.5v11M6.5 4.5 4 7M6.5 4.5 9 7" stroke="currentColor" strokeWidth={NAV} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M13.5 15.5v-11M13.5 15.5 11 13M13.5 15.5 16 13" stroke="currentColor" strokeWidth={NAV} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ThumbsUpIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M7 10v9H4v-9h3Zm3.5 0 2.7-6a1.8 1.8 0 0 1 3.3 1.2l-.9 4.8h3.4a2 2 0 0 1 1.9 2.7l-1.8 5.4a2 2 0 0 1-1.9 1.4H10.5a1.5 1.5 0 0 1-1.5-1.5v-6.5a2 2 0 0 1 1.5-2Z"
        stroke="currentColor"
        strokeWidth={NAV}
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function HomeIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <path d="M3 9.5 10 4l7 5.5V16a1 1 0 0 1-1 1h-3.5v-5h-5v5H4a1 1 0 0 1-1-1V9.5Z" stroke="currentColor" strokeWidth={NAV} strokeLinejoin="round" />
    </svg>
  );
}

export function InfoIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <circle cx="10" cy="10" r="7.25" stroke="currentColor" strokeWidth={NAV} />
      <path d="M10 9v4.5" stroke="currentColor" strokeWidth={NAV} strokeLinecap="round" />
      <circle cx="10" cy="6.7" r="0.9" fill="currentColor" />
    </svg>
  );
}

export function MailIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <rect x="3" y="5" width="14" height="10" rx="1.3" stroke="currentColor" strokeWidth="1.35" />
      <path d="m3.5 5.8 6.5 5 6.5-5" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Jarvis's nav icon — a four-point sparkle, distinct from the plain chat bubble. */
export function SparkleIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className={className} aria-hidden="true">
      <path d="M10 2.5c.3 2.7 1.2 4.6 2.6 6 1.4 1.4 3.3 2.3 6 2.6-2.7.3-4.6 1.2-6 2.6-1.4 1.4-2.3 3.3-2.6 6-.3-2.7-1.2-4.6-2.6-6-1.4-1.4-3.3-2.3-6-2.6 2.7-.3 4.6-1.2 6-2.6 1.4-1.4 2.3-3.3 2.6-6Z" />
    </svg>
  );
}

export function GearIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <circle cx="10" cy="10" r="2.5" stroke="currentColor" strokeWidth={NAV} />
      <path
        d="M10 3v1.6M10 15.4V17M17 10h-1.6M4.6 10H3M14.7 5.3l-1.15 1.15M6.45 13.55 5.3 14.7M14.7 14.7l-1.15-1.15M6.45 6.45 5.3 5.3"
        stroke="currentColor"
        strokeWidth={NAV}
        strokeLinecap="round"
      />
    </svg>
  );
}

export function MenuIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <path d="M3 5.5h14M3 10h14M3 14.5h14" stroke="currentColor" strokeWidth={NAV} strokeLinecap="round" />
    </svg>
  );
}

export function CloseIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <path d="M5 5l10 10M15 5 5 15" stroke="currentColor" strokeWidth={NAV} strokeLinecap="round" />
    </svg>
  );
}

export function HistoryIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <path d="M4 10a6 6 0 1 0 1.8-4.3" stroke="currentColor" strokeWidth={NAV} strokeLinecap="round" />
      <path d="M4 3.5V7h3.5" stroke="currentColor" strokeWidth={NAV} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10 7v3.2l2.2 1.3" stroke="currentColor" strokeWidth={NAV} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function BuildingIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <rect x="4" y="3" width="9" height="14" rx="1" stroke="currentColor" strokeWidth={NAV} />
      <path d="M13 8.5h3v8.5h-3" stroke="currentColor" strokeWidth={NAV} strokeLinejoin="round" />
      <path d="M6.5 6.5h1M6.5 9.5h1M6.5 12.5h1M9.5 6.5h1M9.5 9.5h1M9.5 12.5h1" stroke="currentColor" strokeWidth={NAV} strokeLinecap="round" />
    </svg>
  );
}

export function HammerIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <path d="M11.5 3.5 16.5 8.5 14.6 10.4 9.6 5.4Z" stroke="currentColor" strokeWidth={NAV} strokeLinejoin="round" />
      <path d="M8.6 6.4 4 11a1 1 0 0 0 0 1.4l.1.1" stroke="currentColor" strokeWidth={NAV} strokeLinecap="round" />
      <path d="M12.6 9.4 6.2 15.8a1.4 1.4 0 0 1-2-2l6.4-6.4" stroke="currentColor" strokeWidth={NAV} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ClientHomeIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <path d="M2.5 9.2 10 3l7.5 6.2" stroke="currentColor" strokeWidth={NAV} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4.5 8v8.5h11V8" stroke="currentColor" strokeWidth={NAV} strokeLinejoin="round" />
      <path d="M8.2 16.5v-4a1.8 1.8 0 0 1 3.6 0v4" stroke="currentColor" strokeWidth={NAV} strokeLinejoin="round" />
    </svg>
  );
}

/** Top bar quick-add — bold plus (BT weight). */
export function PlusIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <path d="M10 4.25v11.5M4.25 10h11.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

export function CheckIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <path d="M4 10.5l4 4 8-9" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function PencilIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <path
        d="M12.2 4.3l3.5 3.5M3.5 16.5l3.1-.6 8.6-8.6a1.6 1.6 0 0 0 0-2.3l-1.3-1.3a1.6 1.6 0 0 0-2.3 0L3.9 12.4l-.4 4.1Z"
        stroke="currentColor"
        strokeWidth={NAV}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function SortArrowsIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <path d="M7 8.5 10 5l3 3.5M7 11.5 10 15l3-3.5" stroke="currentColor" strokeWidth={NAV} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function PhoneIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <path
        d="M6.2 3.8c.4-.4 1-.5 1.5-.3l1.6.6c.5.2.8.7.7 1.2l-.3 1.5a1.2 1.2 0 0 1-.7.9l-.9.4a9.2 9.2 0 0 0 3.8 3.8l.4-.9a1.2 1.2 0 0 1 .9-.7l1.5-.3c.5-.1 1 .2 1.2.7l.6 1.6c.2.5.1 1.1-.3 1.5l-.9.9c-.4.4-1 .6-1.5.5A12.4 12.4 0 0 1 4.8 6.2c-.1-.5.1-1.1.5-1.5l.9-.9Z"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function CalendarIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <rect x="3" y="4.5" width="14" height="12" rx="1.4" stroke="currentColor" strokeWidth="1.35" />
      <path d="M3 8h14M7 3v3M13 3v3" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" />
      <path d="M6.5 11.5h2M9.5 11.5h2M12.5 11.5h1.5M6.5 14h2M9.5 14h2" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" />
    </svg>
  );
}

export function NoteIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <path
        d="M5 3.5h7.2L15.5 6.8V16a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1Z"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinejoin="round"
      />
      <path d="M12 3.5V7h3.5M7 10.5h6M7 13.5h4" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function TaskIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <rect x="3.5" y="3.5" width="13" height="13" rx="2" stroke="currentColor" strokeWidth="1.35" />
      <path d="M6.5 10.2 8.8 12.5 13.5 7.5" stroke="currentColor" strokeWidth="1.45" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Chart bars — Reports library rows. */
export function ChartIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <path d="M3.5 16.5h13" stroke="currentColor" strokeWidth={NAV} strokeLinecap="round" />
      <path d="M5.5 16.5V10M10 16.5V5.5M14.5 16.5v-4" stroke="currentColor" strokeWidth={NAV} strokeLinecap="round" />
    </svg>
  );
}

/** Map pin — Lead Map empty / toolbar. */
export function MapPinIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <path
        d="M10 17s5.5-4.2 5.5-8.2A5.5 5.5 0 0 0 4.5 8.8C4.5 12.8 10 17 10 17Z"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinejoin="round"
      />
      <circle cx="10" cy="8.5" r="1.8" stroke="currentColor" strokeWidth="1.35" />
    </svg>
  );
}

/** Document / proposal empty state. */
export function DocumentIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <path
        d="M5 2.75h6.2L15.5 7v9.25A1 1 0 0 1 14.5 17.25h-9.5A1 1 0 0 1 4 16.25V3.75A1 1 0 0 1 5 2.75Z"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinejoin="round"
      />
      <path d="M11.2 2.75V7H15.5M7 10.5h6M7 13.5h4" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function FunnelIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <path
        d="M3.5 4.5h13l-4.5 5.2V15l-4 1.5v-6.8L3.5 4.5Z"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Documents folder row — BT folder glyph (replaces emoji). */
export function FolderIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <path
        d="M3.25 6.25V15a1.25 1.25 0 0 0 1.25 1.25h11a1.25 1.25 0 0 0 1.25-1.25V8.5A1.25 1.25 0 0 0 15.5 7.25H10L8.4 5.5H4.5A1.25 1.25 0 0 0 3.25 6.75v-.5Z"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Attached Documents pseudo-folder — paperclip (BT metaphor). */
export function PaperclipIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <path
        d="M15.2 9.4 9.05 15.55a3.25 3.25 0 0 1-4.6-4.6L10.6 4.8a2.15 2.15 0 1 1 3.05 3.05L7.5 14"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Photos / Inspection Pictures empty + Files Photos metaphor. */
export function PhotoIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <rect x="2.75" y="4.5" width="14.5" height="11" rx="1.4" stroke="currentColor" strokeWidth="1.35" />
      <circle cx="7.25" cy="8.5" r="1.35" stroke="currentColor" strokeWidth="1.35" />
      <path d="m6.5 14.5 3.2-3.4 2.1 2.2 2.4-2.8 2.3 4" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** RFI / clipboard list. */
export function ClipboardIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <path
        d="M7 3.75h6a1 1 0 0 1 1 1V5.5h1.25A1.25 1.25 0 0 1 16.5 6.75v9A1.25 1.25 0 0 1 15.25 17H4.75A1.25 1.25 0 0 1 3.5 15.75v-9A1.25 1.25 0 0 1 4.75 5.5H6V4.75a1 1 0 0 1 1-1Z"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinejoin="round"
      />
      <path d="M7.5 3.75h5V5h-5V3.75ZM7 9.5h6M7 12.5h4" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" />
    </svg>
  );
}

/** Warranty claim shield. */
export function ShieldIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <path
        d="M10 2.75 15.5 5v4.4c0 3.4-2.2 5.9-5.5 7.35C6.7 15.3 4.5 12.8 4.5 9.4V5L10 2.75Z"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinejoin="round"
      />
      <path d="m7.5 10 1.8 1.8 3.4-3.6" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Daily Log like — outline heart (fill via CSS currentColor when liked). */
export function HeartIcon({ className, filled }: IconProps & { filled?: boolean }) {
  return (
    <svg viewBox="0 0 20 20" fill={filled ? "currentColor" : "none"} className={className} aria-hidden="true">
      <path
        d="M10 16.25s-5.5-3.35-5.5-7.1A3.4 3.4 0 0 1 10 5.85 3.4 3.4 0 0 1 15.5 9.15c0 3.75-5.5 7.1-5.5 7.1Z"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Video file placeholder in galleries. */
export function VideoIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <rect x="2.75" y="5" width="10.5" height="10" rx="1.3" stroke="currentColor" strokeWidth="1.35" />
      <path d="M13.25 8.5 17.25 6v8l-4-2.5V8.5Z" stroke="currentColor" strokeWidth="1.35" strokeLinejoin="round" />
    </svg>
  );
}

/** Broken / unsigned URL warning in file galleries. */
export function AlertIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <path d="M10 3.25 17.25 16H2.75L10 3.25Z" stroke="currentColor" strokeWidth="1.35" strokeLinejoin="round" />
      <path d="M10 8v3.5" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" />
      <circle cx="10" cy="14" r="0.85" fill="currentColor" />
    </svg>
  );
}

/** Plus-in-circle — Gantt row “add child item” (BT metaphor). */
export function PlusCircleIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <circle cx="10" cy="10" r="7.25" stroke="currentColor" strokeWidth={NAV} />
      <path d="M10 6.5v7M6.5 10h7" stroke="currentColor" strokeWidth={NAV} strokeLinecap="round" />
    </svg>
  );
}

/** Upload / export arrow — Gantt export (BT metaphor). */
export function UploadIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <path d="M10 12.5V3.75M10 3.75 6.75 7M10 3.75 13.25 7" stroke="currentColor" strokeWidth={NAV} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 12.5v2.75A1.25 1.25 0 0 0 5.25 16.5h9.5A1.25 1.25 0 0 0 16 15.25V12.5" stroke="currentColor" strokeWidth={NAV} strokeLinecap="round" />
    </svg>
  );
}

/** Four-way expand — Gantt fullscreen (BT metaphor). */
export function MaximizeIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <path d="M3.5 7.5V3.5H7.5M12.5 3.5h4v4M16.5 12.5v4h-4M7.5 16.5h-4v-4" stroke="currentColor" strokeWidth={NAV} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Horizontal double-arrows — expand/collapse Gantt columns (BT metaphor). */
export function ExpandColumnsIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <path d="M8 6.5 4.5 10 8 13.5M12 6.5 15.5 10 12 13.5" stroke="currentColor" strokeWidth={NAV} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10 4v12" stroke="currentColor" strokeWidth={NAV} strokeLinecap="round" opacity="0.35" />
    </svg>
  );
}

/** Purchase Orders — clipboard with PO lines. */
export function PurchaseOrderIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <path
        d="M7 3.75h6a1 1 0 0 1 1 1V5.5h1.25A1.25 1.25 0 0 1 16.5 6.75v9A1.25 1.25 0 0 1 15.25 17H4.75A1.25 1.25 0 0 1 3.5 15.75v-9A1.25 1.25 0 0 1 4.75 5.5H6V4.75a1 1 0 0 1 1-1Z"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinejoin="round"
      />
      <path d="M7.5 3.75h5V5h-5V3.75ZM7 9.25h6M7 12h4.5M7 14.5h3" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" />
    </svg>
  );
}

/** Bills / receipts — folded receipt with lines. */
export function ReceiptIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <path
        d="M5.5 3.5h9v13.25l-1.5-1-1.5 1-1.5-1-1.5 1-1.5-1-1.5 1V3.5Z"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinejoin="round"
      />
      <path d="M7.5 7h5M7.5 9.75h5M7.5 12.5h3" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" />
    </svg>
  );
}

/** Bids / bid packages — tag with price mark. */
export function BidIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <path
        d="M3.5 10.25V5.75A1.25 1.25 0 0 1 4.75 4.5h4.6c.33 0 .65.13.88.37l5.9 5.9a1.25 1.25 0 0 1 0 1.77l-3.53 3.53a1.25 1.25 0 0 1-1.77 0l-5.9-5.9A1.25 1.25 0 0 1 3.5 10.25Z"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinejoin="round"
      />
      <circle cx="7.25" cy="7.5" r="1.1" stroke="currentColor" strokeWidth="1.35" />
    </svg>
  );
}

/** Online / recorded payments — card. */
export function PaymentCardIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <rect x="2.75" y="5" width="14.5" height="10" rx="1.4" stroke="currentColor" strokeWidth="1.35" />
      <path d="M2.75 8.25h14.5M5.5 12h3.5" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" />
    </svg>
  );
}

/** Cost Inbox — tray. */
export function InboxIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <path
        d="M3.5 11.5 5.2 4.9A1.25 1.25 0 0 1 6.4 4h7.2a1.25 1.25 0 0 1 1.2.9l1.7 6.6"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M3.5 11.5H7l1 2h4l1-2h3.5v3.25A1.25 1.25 0 0 1 15.25 16H4.75A1.25 1.25 0 0 1 3.5 14.75V11.5Z"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinejoin="round"
      />
    </svg>
  );
}
