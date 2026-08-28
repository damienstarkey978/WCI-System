/**
 * Minimal inline icon set for the Buildertrend-match shell — hand-drawn SVGs
 * rather than a new icon-library dependency, since only a handful are needed.
 */

type IconProps = { className?: string };

export function SearchIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.6" />
      <path d="M17 17l-3.5-3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function BellIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <path
        d="M10 3a4 4 0 0 0-4 4v2.5c0 .8-.3 1.6-.9 2.2L4 13h12l-1.1-1.3A3 3 0 0 1 14 9.5V7a4 4 0 0 0-4-4Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path d="M8.2 15.5a1.8 1.8 0 0 0 3.6 0" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

export function ChatIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <path
        d="M4 5.5h12a1 1 0 0 1 1 1V13a1 1 0 0 1-1 1H8.5L5 16.5V14H4a1 1 0 0 1-1-1V6.5a1 1 0 0 1 1-1Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function PeopleIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <circle cx="7" cy="7" r="2.3" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="14" cy="8" r="1.8" stroke="currentColor" strokeWidth="1.4" />
      <path d="M2.5 16c.4-2.6 2.3-4 4.5-4s4.1 1.4 4.5 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M12.5 12.3c1.7.1 3.1 1.4 3.5 3.7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

export function HelpIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <circle cx="10" cy="10" r="7.5" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M7.8 8a2.2 2.2 0 1 1 3.3 1.9c-.7.4-1.1.8-1.1 1.6"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <circle cx="10" cy="14" r="0.9" fill="currentColor" />
    </svg>
  );
}

export function ChevronDownIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <path d="M5.5 8l4.5 4.5L14.5 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function FilterIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <path d="M3 5h14M6 10h8M8.5 15h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function SortIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <path d="M6 4v12M6 4 3 7M6 4l3 3M14 16V4M14 16l3-3M14 16l-3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ThumbsUpIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M7 10v9H4v-9h3Zm3.5 0 2.7-6a1.8 1.8 0 0 1 3.3 1.2l-.9 4.8h3.4a2 2 0 0 1 1.9 2.7l-1.8 5.4a2 2 0 0 1-1.9 1.4H10.5a1.5 1.5 0 0 1-1.5-1.5v-6.5a2 2 0 0 1 1.5-2Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function HomeIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <path d="M3 9.5 10 4l7 5.5V16a1 1 0 0 1-1 1h-3.5v-5h-5v5H4a1 1 0 0 1-1-1V9.5Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}

export function InfoIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <circle cx="10" cy="10" r="7.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M10 9v4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="10" cy="6.7" r="0.9" fill="currentColor" />
    </svg>
  );
}

export function MailIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <rect x="3" y="5" width="14" height="10" rx="1.3" stroke="currentColor" strokeWidth="1.4" />
      <path d="m3.5 5.8 6.5 5 6.5-5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
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
