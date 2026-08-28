import { StaffShell } from "@/components/shell/StaffShell";

export const dynamic = "force-dynamic";

export default function VendorsLayout({ children }: LayoutProps<"/vendors">) {
  return <StaffShell>{children}</StaffShell>;
}
