import { StaffShell } from "@/components/shell/StaffShell";

export const dynamic = "force-dynamic";

export default function JarvisLayout({ children }: LayoutProps<"/jarvis">) {
  return <StaffShell>{children}</StaffShell>;
}
