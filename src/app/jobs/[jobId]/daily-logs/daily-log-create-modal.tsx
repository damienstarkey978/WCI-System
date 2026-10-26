"use client";

import { useCallback, useState } from "react";

import { CreateModal } from "@/components/shell/CreateModal";

import { DailyLogForm } from "./daily-log-form";

/** Controlled create modal: closes on successful submit and leaves the list visible. */
export function DailyLogCreateModal({ jobId, aiEnabled }: { jobId: string; aiEnabled: boolean }) {
  const [open, setOpen] = useState(false);
  const handleSuccess = useCallback(() => setOpen(false), []);

  return (
    <CreateModal triggerLabel="+ Daily Log" title="New daily log" open={open} onOpenChange={setOpen}>
      <DailyLogForm jobId={jobId} aiEnabled={aiEnabled} onSuccess={handleSuccess} />
    </CreateModal>
  );
}
