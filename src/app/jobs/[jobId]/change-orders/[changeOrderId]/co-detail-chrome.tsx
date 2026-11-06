"use client";

import { useRef, useState, type ReactNode } from "react";

import { ChangeOrderHeaderActions } from "./co-header-actions";

/**
 * Owns Edit toggle so the pencil opens the real edit form (not a dead icon).
 * Edit panel renders full-width under the header row.
 */
export function ChangeOrderDetailChrome({
  jobId,
  changeOrderId,
  status,
  editable,
  titleBlock,
  statusActions,
  editForm,
}: {
  jobId: string;
  changeOrderId: string;
  status: string;
  editable: boolean;
  titleBlock: ReactNode;
  statusActions?: ReactNode;
  editForm: ReactNode;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const editRef = useRef<HTMLDivElement>(null);

  function openEdit() {
    setEditOpen(true);
    window.requestAnimationFrame(() => {
      editRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        {titleBlock}
        <div className="flex flex-col items-end gap-2">
          <ChangeOrderHeaderActions
            jobId={jobId}
            changeOrderId={changeOrderId}
            status={status}
            editable={editable}
            onEditClick={openEdit}
          />
          {statusActions}
        </div>
      </div>
      {editable && editOpen ? (
        <div ref={editRef} className="mt-2">
          {editForm}
        </div>
      ) : null}
    </>
  );
}
