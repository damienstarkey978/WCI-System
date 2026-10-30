import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * Cost Inbox used to sit next to Bills and overlap the same OCR/receipt
 * workflow (Heather known-bug #39). Buildertrend is collapsing Cost Inbox into
 * Bills; we do the same — keep this path for bookmarks/old links, send staff
 * to the Bills INBOX tab.
 */
export default async function CostInboxPage({ params }: PageProps<"/jobs/[jobId]/cost-inbox">) {
  const { jobId } = await params;
  redirect(`/jobs/${jobId}/bills?status=INBOX`);
}
