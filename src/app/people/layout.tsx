import { StaffShell } from "@/components/shell/StaffShell";

export const dynamic = "force-dynamic";

export default function PeopleLayout({ children }: LayoutProps<"/people">) {
  return <StaffShell>{children}</StaffShell>;
}
