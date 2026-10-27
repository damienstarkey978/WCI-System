import { StaffShell } from "@/components/shell/StaffShell";

export const dynamic = "force-dynamic";

/**
 * Sales CRM shell — Buildertrend's Sales surfaces have no left jobs sidebar.
 * Top nav (including the Sales dropdown) stays; the job rail does not.
 */
export default function LeadsLayout({ children }: LayoutProps<"/leads">) {
  return <StaffShell showJobSidebar={false}>{children}</StaffShell>;
}
