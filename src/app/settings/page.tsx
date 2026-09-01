import Link from "next/link";

import { SetupNotice } from "@/app/admin/setup-notice";
import { ThemeToggle } from "@/components/settings/ThemeToggle";
import { FunUiToggle } from "@/components/settings/FunUiToggle";
import { UserRole } from "@/generated/prisma/enums";
import { currentAppUser } from "@/lib/auth";

import { MyProfileForm } from "./profile-form";

export const dynamic = "force-dynamic";

/**
 * "My Settings" — reached from the avatar menu, top right (src/components/shell/
 * TopNav.tsx). Clerk's own "Manage account" (same menu) already owns identity: email,
 * password, 2FA, connected accounts — this page only covers what WCI OS itself
 * controls: the display fields staff/[userId] also edits (admin-editing-someone-else's
 * counterpart to this self-service page) and app preferences like dark mode.
 */
export default async function SettingsPage() {
  let user;
  try {
    user = await currentAppUser();
  } catch (error) {
    return <SetupNotice detail={error instanceof Error ? error.message : String(error)} />;
  }
  if (!user) {
    return <SetupNotice detail="No organization found. Seed the database, then reload." />;
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 p-6">
      <div>
        <h1 className="text-xl font-semibold text-[var(--bt-text)]">My Settings</h1>
        <p className="text-xs text-[var(--bt-muted)]">
          For your email, password, or two-factor security, use &quot;Manage account&quot; in the avatar menu instead.
        </p>
      </div>

      <section className="rounded-lg border bg-[var(--bt-panel-bg)] p-4" style={{ borderColor: "var(--bt-border)" }}>
        <h2 className="text-sm font-semibold text-[var(--bt-text)]">Appearance</h2>
        <div className="mt-3 flex flex-col gap-4">
          <ThemeToggle />
          <FunUiToggle />
        </div>
      </section>

      <section className="rounded-lg border bg-[var(--bt-panel-bg)] p-4" style={{ borderColor: "var(--bt-border)" }}>
        <h2 className="text-sm font-semibold text-[var(--bt-text)]">Profile</h2>
        <p className="mt-0.5 text-xs text-[var(--bt-muted)]">{user.email}</p>
        <div className="mt-3">
          <MyProfileForm name={user.name} title={user.title} phone={user.phone} />
        </div>
      </section>

      {user.role === UserRole.ADMIN ? (
        <Link
          href="/settings/company"
          className="rounded-lg border bg-[var(--bt-panel-bg)] p-4 text-sm font-medium text-[var(--bt-primary)] hover:underline"
          style={{ borderColor: "var(--bt-border)" }}
        >
          Company settings →
        </Link>
      ) : null}
    </div>
  );
}
