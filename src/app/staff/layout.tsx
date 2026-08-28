import { StaffShell } from "@/components/shell/StaffShell";

export const dynamic = "force-dynamic";

export default function StaffLayout({ children }: LayoutProps<"/staff">) {
  return <StaffShell>{children}</StaffShell>;
}
