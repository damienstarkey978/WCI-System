import { StaffShell } from "@/components/shell/StaffShell";

export const dynamic = "force-dynamic";

export default function SettingsLayout({ children }: LayoutProps<"/settings">) {
  return <StaffShell>{children}</StaffShell>;
}
