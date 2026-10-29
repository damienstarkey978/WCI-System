"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { isJarvisUiEnabled } from "@/lib/feature-flags";

import { useDismissible } from "./use-dismissible";

import {
  FILES_NAV,
  FINANCIAL_NAV,
  HELP_MENU_ITEMS,
  JOBS_NAV,
  MESSAGING_NAV,
  PEOPLE_NAV,
  PROJECT_MANAGEMENT_NAV,
  QUICK_ADD_NAV,
  REPORTS_HREF,
  SALES_NAV,
  type JobNavLink,
  type JobsMenuItem,
} from "@/lib/buildertrend-nav";

import { BrandMark } from "./BrandMark";
import { GlobalSearch } from "./GlobalSearch";
import type { SidebarJob } from "./JobSidebar";
import { MobileMenuDrawer } from "./MobileMenuDrawer";
import { StaffUserMenu } from "./StaffUserMenu";
import {
  BellIcon,
  ChatIcon,
  ChevronDownIcon,
  ClientHomeIcon,
  HammerIcon,
  HelpIcon,
  MenuIcon,
  PeopleIcon,
  PlusIcon,
  SparkleIcon,
} from "./icons";
import { markAllNotificationsReadAction, markNotificationReadAction } from "./notification-actions";

export interface BellNotification {
  readonly id: string;
  readonly payload: Record<string, unknown>;
  readonly readAt: string | null;
  readonly createdAt: string;
}

function notificationText(payload: Record<string, unknown>): string {
  if (payload.type === "comment_mention") {
    const preview = typeof payload.bodyPreview === "string" ? payload.bodyPreview : "";
    const featureType = typeof payload.featureType === "string" ? payload.featureType.replace(/_/g, " ").toLowerCase() : "an item";
    return `You were mentioned on ${featureType}: "${preview}"`;
  }
  return typeof payload.type === "string" ? payload.type.replace(/_/g, " ") : "New notification";
}

/** The Bell icon's dropdown: recent in-app notifications, with mark-read actions. */
function NotificationBell({ notifications, unreadCount }: { notifications: readonly BellNotification[]; unreadCount: number }) {
  const { open, setOpen, rootRef } = useDismissible();

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="relative rounded p-2 transition hover:bg-white/10"
        aria-label="Notifications"
        aria-expanded={open}
      >
        <BellIcon className="h-4.5 w-4.5" />
        {unreadCount > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        ) : null}
      </button>
      {open ? (
        <div className="absolute right-0 top-full z-30 mt-1 w-80 rounded-md border border-black/10 bg-[var(--bt-panel-bg)] text-sm text-[var(--bt-text)] shadow-lg">
          <div className="flex items-center justify-between border-b px-3 py-2" style={{ borderColor: "var(--bt-border)" }}>
            <span className="font-semibold">Notifications</span>
            {unreadCount > 0 ? (
              <form action={markAllNotificationsReadAction}>
                <button type="submit" className="text-xs font-medium text-[var(--bt-primary)] hover:underline">
                  Mark all read
                </button>
              </form>
            ) : null}
          </div>
          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="px-3 py-6 text-center text-xs text-[var(--bt-muted)]">You&apos;re all caught up.</p>
            ) : (
              notifications.map((notification) => (
                <div key={notification.id} className="flex items-start justify-between gap-2 border-b px-3 py-2 last:border-0" style={{ borderColor: "var(--bt-border)" }}>
                  <p className={notification.readAt ? "text-[var(--bt-muted)]" : "font-medium text-[var(--bt-text)]"}>
                    {notificationText(notification.payload)}
                  </p>
                  {!notification.readAt ? (
                    <form action={markNotificationReadAction}>
                      <input type="hidden" name="notificationId" value={notification.id} />
                      <button type="submit" className="shrink-0 text-xs text-[var(--bt-primary)] hover:underline">
                        Mark read
                      </button>
                    </form>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

const PEOPLE_ICONS = { users: PeopleIcon, hammer: HammerIcon, home: ClientHomeIcon } as const;

/**
 * The People icon's dropdown — Internal Users / Subs-Vendors / Client Contacts, each
 * its own full directory page (previously this icon went to a single summary page).
 * Highlighted while open or while any of the three pages is showing.
 */
function PeopleDropdown({ pathname }: { pathname: string | null }) {
  const { open, setOpen, rootRef } = useDismissible();
  const onPeoplePage = PEOPLE_NAV.some((item) => pathname?.startsWith(item.href));

  return (
    <div className="relative hidden sm:block" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="rounded p-2 transition hover:bg-white/10"
        style={open || onPeoplePage ? { background: "var(--bt-nav-hover)" } : undefined}
        aria-label="People"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <PeopleIcon className="h-4.5 w-4.5" />
      </button>
      {open ? (
        <div role="menu" className="absolute right-0 top-full z-30 mt-2 w-60 rounded-lg border border-black/10 bg-[var(--bt-panel-bg)] py-2 text-sm text-[var(--bt-text)] shadow-lg">
          {PEOPLE_NAV.map((item) => {
            const Icon = PEOPLE_ICONS[item.icon];
            return (
              <Link
                key={item.href}
                href={item.href}
                role="menuitem"
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 px-4 py-2.5 font-medium hover:bg-black/5"
              >
                <Icon className="h-5 w-5" />
                {item.label}
              </Link>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

/** One of Buildertrend's job-scoped mega-dropdowns (Project Management, Files, Financial). */
function JobNavDropdown({ label, items, activeJobId }: { label: string; items: readonly JobNavLink[]; activeJobId?: string }) {
  const { open, setOpen, rootRef } = useDismissible();

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-1 rounded px-3 py-2 transition hover:bg-white/10"
        aria-expanded={open}
      >
        {label}
        <ChevronDownIcon className="h-3.5 w-3.5" />
      </button>
      {open ? (
        <div className="absolute left-0 top-full z-30 mt-1 w-56 rounded-md border border-black/10 bg-[var(--bt-panel-bg)] py-1 text-sm text-[var(--bt-text)] shadow-lg">
          {activeJobId ? (
            items.map((item) => (
              <Link
                key={item.path}
                href={`/jobs/${activeJobId}${item.path}`}
                className="flex items-center justify-between px-3 py-2 hover:bg-black/5"
              >
                {item.label}
                {item.isNew ? (
                  <span className="rounded bg-[var(--bt-primary)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--bt-on-primary)]">
                    New
                  </span>
                ) : null}
              </Link>
            ))
          ) : (
            <div className="px-3 py-2 text-xs text-[var(--bt-muted)]">Select a job first.</div>
          )}
        </div>
      ) : null}
    </div>
  );
}

/** A dropdown of plain (non job-scoped) links, e.g. the "Sales" menu. */
function FlatNavDropdown({ label, items }: { label: string; items: readonly { label: string; href: string }[] }) {
  const { open, setOpen, rootRef } = useDismissible();

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-1 rounded px-3 py-2 transition hover:bg-white/10"
        aria-expanded={open}
      >
        {label}
        <ChevronDownIcon className="h-3.5 w-3.5" />
      </button>
      {open ? (
        <div className="absolute left-0 top-full z-30 mt-1 w-56 rounded-md border border-black/10 bg-[var(--bt-panel-bg)] py-1 text-sm text-[var(--bt-text)] shadow-lg">
          {items.map((item) => (
            <Link key={item.href} href={item.href} className="block px-3 py-2 hover:bg-black/5">
              {item.label}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * The "Jobs" menu — unlike the other dropdowns, it mixes job-scoped items (need an
 * active job) with org-wide ones (always work) and one real Buildertrend item WCI OS
 * hasn't built yet ("soon" — shown, not silently dropped, so the menu still visually
 * matches Buildertrend's, but disabled until the feature exists).
 */
/** One row in a JobsMenuItem dropdown — shared by MixedNavDropdown and QuickAddMenu below. */
function JobsMenuItemRow({ item, activeJobId, onNavigate }: { item: JobsMenuItem; activeJobId?: string; onNavigate?: () => void }) {
  if (item.kind === "global") {
    return (
      <Link key={item.label} href={item.href!} onClick={onNavigate} className="block px-3 py-2 hover:bg-black/5">
        {item.label}
      </Link>
    );
  }
  if (item.kind === "job") {
    if (!activeJobId) {
      return (
        <span key={item.label} className="block px-3 py-2 text-[var(--bt-muted)]" title="Select a job first">
          {item.label}
        </span>
      );
    }
    return (
      <Link key={item.label} href={`/jobs/${activeJobId}${item.jobPath}`} onClick={onNavigate} className="block px-3 py-2 hover:bg-black/5">
        {item.label}
      </Link>
    );
  }
  return (
    <span key={item.label} className="block px-3 py-2 text-[var(--bt-muted)]" title="Coming soon">
      {item.label}
    </span>
  );
}

/** Shared by the Jobs and Messaging dropdowns — both mix job-scoped and org-wide items (JobsMenuItem's "job"/"global"/"soon" kinds). */
function MixedNavDropdown({ label, items, activeJobId }: { label: string; items: readonly JobsMenuItem[]; activeJobId?: string }) {
  const { open, setOpen, rootRef } = useDismissible();

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-1 rounded px-3 py-2 transition hover:bg-white/10"
        aria-expanded={open}
      >
        {label}
        <ChevronDownIcon className="h-3.5 w-3.5" />
      </button>
      {open ? (
        <div className="absolute left-0 top-full z-30 mt-1 w-56 rounded-md border border-black/10 bg-[var(--bt-panel-bg)] py-1 text-sm text-[var(--bt-text)] shadow-lg">
          {items.map((item) => (
            <JobsMenuItemRow key={item.label} item={item} activeJobId={activeJobId} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * The top bar's "+" quick-add button (Buildertrend's own order, QUICK_ADD_NAV). A
 * scrollable panel since the real list runs to 19 items — wider than the other
 * dropdowns since several labels ("Time Clock Shift", "Warranty Claim") run long.
 */
function QuickAddMenu({ activeJobId }: { activeJobId?: string }) {
  const { open, setOpen, rootRef } = useDismissible();

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex items-center justify-center rounded p-2 transition hover:bg-white/10"
        aria-label="Quick add"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <PlusIcon className="h-5 w-5" />
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-full z-30 mt-2 max-h-[28rem] w-64 overflow-y-auto rounded-lg border border-black/10 bg-[var(--bt-panel-bg)] py-1 text-sm text-[var(--bt-text)] shadow-lg"
        >
          {QUICK_ADD_NAV.map((item) => (
            <JobsMenuItemRow key={item.label} item={item} activeJobId={activeJobId} onNavigate={() => setOpen(false)} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** The top bar's Help (?) menu — HELP_MENU_ITEMS' own doc comment explains why none of these have a real destination yet. */
function HelpMenu() {
  const { open, setOpen, rootRef } = useDismissible();

  return (
    <div className="relative hidden sm:block" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="rounded p-2 transition hover:bg-white/10"
        aria-label="Help"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <HelpIcon className="h-4.5 w-4.5" />
      </button>
      {open ? (
        <div role="menu" className="absolute right-0 top-full z-30 mt-2 w-48 rounded-lg border border-black/10 bg-[var(--bt-panel-bg)] py-2 text-sm text-[var(--bt-text)] shadow-lg">
          {HELP_MENU_ITEMS.map((label) => (
            <span key={label} className="block px-4 py-2 text-[var(--bt-muted)]" title="Coming soon">
              {label}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Buildertrend's dark-teal top bar: brand mark, primary nav, the job-scoped
 * mega-dropdowns (Project Management, Files, Financial — meaningful only once
 * a job is selected), the Jobs/Messaging dropdowns (a mix of job-scoped and
 * org-wide items each), and the icon cluster on the right. Buildertrend has
 * no secondary tab strip below this bar — every
 * job-scoped section, including Files and Financial, lives in a top-level
 * dropdown here (confirmed against Damien's screenshots, 2026-08-28). Client
 * component only for the dropdowns' open state and the active-link highlight.
 */
export function TopNav({
  activeJobId,
  clerkConfigured,
  isAdmin = false,
  userName = "",
  userEmail = "",
  userRoleLabel = "",
  notifications = [],
  unreadCount = 0,
  jobs = [],
  financialNav = FINANCIAL_NAV,
  showSales = true,
  showReports = true,
}: {
  activeJobId?: string;
  /** Computed server-side (CLERK_SECRET_KEY isn't inlined into the client bundle, so this
   *  component can't call isClerkConfigured() itself and get the right answer in the browser). */
  clerkConfigured: boolean;
  /** Whether to show "Company settings" in the avatar menu below (AppShell.tsx resolves this). */
  isAdmin?: boolean;
  userName?: string;
  userEmail?: string;
  userRoleLabel?: string;
  notifications?: readonly BellNotification[];
  unreadCount?: number;
  /** For the mobile menu drawer's job jump-list — the same list JobSidebar renders, which is hidden below `md`. */
  jobs?: readonly SidebarJob[];
  /** Financial dropdown items — Sales Rep without job financials gets Commission only. */
  financialNav?: readonly JobNavLink[];
  showSales?: boolean;
  showReports?: boolean;
}) {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header
      className="flex h-14 items-center gap-2 px-3 text-white sm:gap-3 sm:px-4"
      style={{ background: "var(--bt-nav)" }}
    >
      {/* Left: brand + primary nav (BT order) */}
      <div className="flex min-w-0 shrink-0 items-center gap-3 lg:gap-5">
        <button
          type="button"
          onClick={() => setMobileMenuOpen(true)}
          className="rounded p-2 transition hover:bg-white/10 lg:hidden"
          aria-label="Open menu"
          aria-expanded={mobileMenuOpen}
        >
          <MenuIcon className="h-5 w-5" />
        </button>

        <Link href="/dashboard" className="flex items-center">
          <BrandMark className="h-8 w-auto" />
        </Link>

        <nav className="hidden items-center gap-0.5 text-sm font-medium xl:flex">
          {showSales ? <FlatNavDropdown label="Sales" items={SALES_NAV} /> : null}
          <MixedNavDropdown label="Jobs" items={JOBS_NAV} activeJobId={activeJobId} />

          <JobNavDropdown label="Project Management" items={PROJECT_MANAGEMENT_NAV} activeJobId={activeJobId} />
          <JobNavDropdown label="Files" items={FILES_NAV} activeJobId={activeJobId} />
          <MixedNavDropdown label="Messaging" items={MESSAGING_NAV} activeJobId={activeJobId} />

          {financialNav.length > 0 ? (
            <JobNavDropdown label="Financial" items={financialNav} activeJobId={activeJobId} />
          ) : null}

          {showReports ? (
            <Link
              href={REPORTS_HREF}
              className="rounded px-3 py-2 transition hover:bg-white/10"
              style={pathname?.startsWith(REPORTS_HREF) ? { background: "var(--bt-nav-hover)" } : undefined}
            >
              Reports
            </Link>
          ) : null}
        </nav>
      </div>

      {/* Center: BT white Search pill (hidden below md — compact icon lives in the right cluster) */}
      <div className="hidden min-w-0 flex-1 justify-center px-2 md:flex">
        <GlobalSearch variant="pill" className="w-full max-w-sm lg:max-w-md" />
      </div>

      {/* Right: + · bell · chat · people · help · avatar (BT). Jarvis is WCI-only, kept after chat. */}
      <div className="ml-auto flex shrink-0 items-center gap-0.5 sm:gap-1">
        <div className="md:hidden">
          <GlobalSearch variant="compact" />
        </div>
        <QuickAddMenu activeJobId={activeJobId} />
        <NotificationBell notifications={notifications} unreadCount={unreadCount} />
        {activeJobId ? (
          <Link
            href={`/jobs/${activeJobId}/messages`}
            className="hidden rounded p-2 transition hover:bg-white/10 sm:block"
            style={pathname?.endsWith("/messages") ? { background: "var(--bt-nav-hover)" } : undefined}
            aria-label="Messages"
            title="Messages"
          >
            <ChatIcon className="h-4.5 w-4.5" />
          </Link>
        ) : (
          <span className="hidden rounded p-2 text-white/40 sm:block" aria-label="Messages" title="Select a job first">
            <ChatIcon className="h-4.5 w-4.5" />
          </span>
        )}
        {isJarvisUiEnabled() ? (
          <Link
            href="/jarvis"
            className="hidden rounded p-2 transition hover:bg-white/10 sm:block"
            style={pathname?.startsWith("/jarvis") ? { background: "var(--bt-nav-hover)" } : undefined}
            aria-label="Jarvis"
            title="Jarvis"
          >
            <SparkleIcon className="h-4.5 w-4.5" />
          </Link>
        ) : null}
        <PeopleDropdown pathname={pathname} />
        <HelpMenu />
        <StaffUserMenu
          name={userName}
          email={userEmail}
          roleLabel={userRoleLabel}
          isAdmin={isAdmin}
          clerkConfigured={clerkConfigured}
        />
      </div>

      <MobileMenuDrawer
        open={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
        jobs={jobs}
        activeJobId={activeJobId}
        financialNav={financialNav}
        showSales={showSales}
        showReports={showReports}
      />
    </header>
  );
}
