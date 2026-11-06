"use client";

import { useState } from "react";

import { CreateModal } from "@/components/shell/CreateModal";
import type { CostCodeOption } from "@/components/financial/CostCodeLineItems";

import { CreateChangeOrderForm } from "./create-change-order-form";

/**
 * Controlled + Change Order modal — Cancel closes; Save redirects to the new CO.
 * No decorative header icons: only Close + working create form.
 */
export function CreateChangeOrderModal({
  jobId,
  jobName,
  costCodes,
  clientName = null,
  triggerLabel = "+ Change Order",
  variant = "primary",
}: {
  jobId: string;
  jobName: string;
  costCodes: readonly CostCodeOption[];
  clientName?: string | null;
  triggerLabel?: string;
  variant?: "primary" | "secondary";
}) {
  const [open, setOpen] = useState(false);

  return (
    <CreateModal
      triggerLabel={triggerLabel}
      title="Change Order"
      size="lg"
      variant={variant}
      open={open}
      onOpenChange={setOpen}
      hideHeader
    >
      <CreateChangeOrderForm
        jobId={jobId}
        jobName={jobName}
        costCodes={costCodes}
        clientName={clientName}
        onCancel={() => setOpen(false)}
      />
    </CreateModal>
  );
}
