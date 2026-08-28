import { StaffShell } from "@/components/shell/StaffShell";

export const dynamic = "force-dynamic";

export default function ClientsLayout({ children }: LayoutProps<"/clients">) {
  return <StaffShell>{children}</StaffShell>;
}
