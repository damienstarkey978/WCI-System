import { StaffShell } from "@/components/shell/StaffShell";

export const dynamic = "force-dynamic";

/** Materials Catalog lives under Sales in Buildertrend — no jobs sidebar. */
export default function MaterialsLayout({ children }: LayoutProps<"/materials">) {
  return <StaffShell showJobSidebar={false}>{children}</StaffShell>;
}
