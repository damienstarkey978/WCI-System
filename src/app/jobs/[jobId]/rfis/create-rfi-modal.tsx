"use client";

import { useState } from "react";

import { CreateModal } from "@/components/shell/CreateModal";

import { CreateRfiForm, type UserOption } from "./create-rfi-form";

/**
 * Controlled + RFI modal so the form can Cancel-close and render BT's job-name
 * + "RFI" header chrome inside the dialog (CreateModal header stays hidden).
 */
export function CreateRfiModal({
  jobId,
  jobName,
  users,
  triggerLabel = "+ RFI",
  variant = "primary",
}: {
  jobId: string;
  jobName: string;
  users: readonly UserOption[];
  triggerLabel?: string;
  variant?: "primary" | "secondary";
}) {
  const [open, setOpen] = useState(false);

  return (
    <CreateModal
      triggerLabel={triggerLabel}
      title="RFI"
      size="lg"
      variant={variant}
      open={open}
      onOpenChange={setOpen}
      hideHeader
    >
      <CreateRfiForm jobId={jobId} jobName={jobName} users={users} onCancel={() => setOpen(false)} />
    </CreateModal>
  );
}
