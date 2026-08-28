import { StaffShell } from "@/components/shell/StaffShell";

export const dynamic = "force-dynamic";

export default function MaterialsLayout({ children }: LayoutProps<"/materials">) {
  return <StaffShell>{children}</StaffShell>;
}
