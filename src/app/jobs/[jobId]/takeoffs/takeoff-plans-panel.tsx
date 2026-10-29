"use client";

import Link from "next/link";
import { useActionState, useRef, useState } from "react";

import { CreateModal } from "@/components/shell/CreateModal";

import {
  detachPlanFromTakeoffAction,
  importPlansFromPlansAndSpecsAction,
  uploadPlanToTakeoffAction,
  type ActionState,
} from "./actions";

const INITIAL: ActionState = {};

export interface TakeoffPlanFileView {
  readonly id: string;
  readonly fileName: string;
  readonly url: string | null;
  readonly mimeType: string | null;
  readonly sizeBytes: number | null;
  readonly uploadedAt: string;
}

export interface AvailablePlanFileView {
  readonly id: string;
  readonly fileName: string;
  readonly sizeBytes: number | null;
  readonly uploadedAt: string;
}

function formatBytes(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function ImportPlansForm({
  jobId,
  takeoffId,
  availablePlans,
  onImported,
}: {
  jobId: string;
  takeoffId: string;
  availablePlans: readonly AvailablePlanFileView[];
  onImported?: () => void;
}) {
  const [state, formAction, pending] = useActionState(importPlansFromPlansAndSpecsAction, INITIAL);
  const [selected, setSelected] = useState<Record<string, boolean>>({});

  if (availablePlans.length === 0) {
    return (
      <div className="flex flex-col gap-3 text-sm">
        <p className="text-[var(--bt-muted)]">
          No other plans on this job yet. Upload a plan below, or add drawings on{" "}
          <Link href={`/jobs/${jobId}/plans-and-specs`} className="text-[var(--bt-primary)] hover:underline">
            Plans &amp; Specs
          </Link>{" "}
          first.
        </p>
      </div>
    );
  }

  const selectedCount = Object.values(selected).filter(Boolean).length;

  return (
    <form
      action={(formData) => {
        setSelected({});
        formAction(formData);
        onImported?.();
      }}
      className="flex flex-col gap-3"
    >
      <input type="hidden" name="jobId" value={jobId} />
      <input type="hidden" name="takeoffId" value={takeoffId} />
      <p className="text-xs text-[var(--bt-muted)]">
        Plans already on this job under Plans &amp; Specs. Tap to select, then import — files stay on Plans
        &amp; Specs too.
      </p>
      <ul className="max-h-64 divide-y overflow-y-auto rounded border" style={{ borderColor: "var(--bt-border)" }}>
        {availablePlans.map((plan) => {
          const checked = Boolean(selected[plan.id]);
          return (
            <li key={plan.id}>
              <label
                className="flex cursor-pointer items-start gap-3 px-3 py-3 active:bg-black/5"
                style={{ background: checked ? "color-mix(in srgb, var(--bt-primary) 8%, transparent)" : undefined }}
              >
                <input
                  type="checkbox"
                  name="fileId"
                  value={plan.id}
                  checked={checked}
                  onChange={(event) =>
                    setSelected((prev) => ({ ...prev, [plan.id]: event.target.checked }))
                  }
                  className="mt-1 h-4 w-4 shrink-0"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-[var(--bt-text)]">{plan.fileName}</span>
                  <span className="block text-xs text-[var(--bt-muted)]">
                    {[formatBytes(plan.sizeBytes), plan.uploadedAt].filter(Boolean).join(" · ")}
                  </span>
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      {state.error ? (
        <p role="alert" className="text-xs text-red-600">
          {state.error}
        </p>
      ) : null}
      {state.ok ? (
        <p className="text-xs text-green-700">
          Imported {state.importedCount ?? selectedCount} plan{(state.importedCount ?? selectedCount) === 1 ? "" : "s"}.
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending || selectedCount === 0}
        className="self-stretch rounded px-4 py-2.5 text-sm font-semibold text-[var(--bt-on-primary)] disabled:opacity-50 sm:self-start sm:py-2"
        style={{ background: "var(--bt-primary)" }}
      >
        {pending ? "Importing…" : selectedCount === 0 ? "Select plans to import" : `Import ${selectedCount} plan${selectedCount === 1 ? "" : "s"}`}
      </button>
    </form>
  );
}

function UploadPlanForm({ jobId, takeoffId }: { jobId: string; takeoffId: string }) {
  const [state, formAction, pending] = useActionState(uploadPlanToTakeoffAction, INITIAL);
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [fileCount, setFileCount] = useState(0);

  return (
    <form
      ref={formRef}
      action={async (formData) => {
        await formAction(formData);
        formRef.current?.reset();
        setFileCount(0);
      }}
      className="flex flex-col gap-3"
    >
      <input type="hidden" name="jobId" value={jobId} />
      <input type="hidden" name="takeoffId" value={takeoffId} />
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragOver(false);
          if (inputRef.current && event.dataTransfer.files.length > 0) {
            inputRef.current.files = event.dataTransfer.files;
            setFileCount(event.dataTransfer.files.length);
          }
        }}
        onClick={() => inputRef.current?.click()}
        className="flex min-h-[7rem] cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-4 py-6 text-center text-sm transition"
        style={{
          borderColor: dragOver ? "var(--bt-primary)" : "var(--bt-border)",
          background: dragOver ? "color-mix(in srgb, var(--bt-primary) 8%, transparent)" : "transparent",
          color: "var(--bt-muted)",
        }}
      >
        <input
          ref={inputRef}
          type="file"
          name="files"
          multiple
          accept=".pdf,.png,.jpg,.jpeg,.tif,.tiff,.dwg,.dxf,application/pdf,image/*"
          className="hidden"
          onChange={(event) => setFileCount(event.currentTarget.files?.length ?? 0)}
        />
        {fileCount > 0 ? (
          <span className="font-medium text-[var(--bt-text)]">
            {fileCount} file{fileCount === 1 ? "" : "s"} selected
          </span>
        ) : (
          <>
            <span className="font-medium text-[var(--bt-text)]">Drop plan files here</span>
            <span className="mt-1">or tap to browse (PDF, images, CAD)</span>
          </>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--bt-muted)]">
        <label className="flex items-center gap-1.5">
          <input type="checkbox" name="clientVisible" defaultChecked />
          Visible to client
        </label>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" name="subVisible" defaultChecked />
          Visible to subs
        </label>
      </div>
      <p className="text-xs text-[var(--bt-muted)]">
        Uploads as a job PLAN (also appears on Plans &amp; Specs) and attaches to this takeoff.
      </p>
      {state.error ? (
        <p role="alert" className="text-xs text-red-600">
          {state.error}
        </p>
      ) : null}
      {state.ok ? <p className="text-xs text-green-700">Plan uploaded and attached.</p> : null}
      <button
        type="submit"
        disabled={pending || fileCount === 0}
        className="self-stretch rounded px-4 py-2.5 text-sm font-semibold text-[var(--bt-on-primary)] disabled:opacity-50 sm:self-start sm:py-2"
        style={{ background: "var(--bt-primary)" }}
      >
        {pending ? "Uploading…" : "Upload plan"}
      </button>
    </form>
  );
}

export function TakeoffPlansPanel({
  jobId,
  takeoffId,
  attachedPlans,
  availablePlans,
}: {
  jobId: string;
  takeoffId: string;
  attachedPlans: readonly TakeoffPlanFileView[];
  availablePlans: readonly AvailablePlanFileView[];
}) {
  return (
    <section
      className="flex flex-col gap-3 rounded-lg border p-3 sm:p-4"
      style={{ borderColor: "var(--bt-border)", background: "var(--bt-panel-bg)" }}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-[var(--bt-text)]">Plans</h2>
          <p className="mt-0.5 text-xs text-[var(--bt-muted)]">
            Attach drawings from Plans &amp; Specs or upload here.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <CreateModal
            triggerLabel="Import from Plans & Specs"
            title="Import from Plans & Specs"
            variant="secondary"
            size="lg"
          >
            <ImportPlansForm jobId={jobId} takeoffId={takeoffId} availablePlans={availablePlans} />
          </CreateModal>
          <CreateModal triggerLabel="Upload plan" title="Upload plan to takeoff" variant="primary">
            <UploadPlanForm jobId={jobId} takeoffId={takeoffId} />
          </CreateModal>
        </div>
      </div>

      {attachedPlans.length === 0 ? (
        <p className="rounded border border-dashed px-3 py-6 text-center text-sm text-[var(--bt-muted)]" style={{ borderColor: "var(--bt-border)" }}>
          No plans attached yet. Import from Plans &amp; Specs or upload a drawing.
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {attachedPlans.map((plan) => (
            <li
              key={plan.id}
              className="flex flex-col overflow-hidden rounded-lg border bg-[var(--bt-page-bg)]"
              style={{ borderColor: "var(--bt-border)" }}
            >
              {plan.url ? (
                <a
                  href={plan.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex h-28 items-center justify-center bg-[var(--bt-panel-bg)] text-3xl text-[var(--bt-muted)]"
                >
                  {plan.mimeType?.startsWith("image/") ? (
                    // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URLs
                    <img src={plan.url} alt={plan.fileName} className="h-full w-full object-cover" />
                  ) : (
                    "📄"
                  )}
                </a>
              ) : (
                <div className="flex h-28 items-center justify-center text-xs text-[var(--bt-muted)]">
                  Unavailable
                </div>
              )}
              <div className="flex flex-1 flex-col gap-2 p-2.5">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-[var(--bt-text)]">{plan.fileName}</div>
                  <div className="text-xs text-[var(--bt-muted)]">
                    {[formatBytes(plan.sizeBytes), plan.uploadedAt].filter(Boolean).join(" · ")}
                  </div>
                </div>
                <form action={detachPlanFromTakeoffAction}>
                  <input type="hidden" name="jobId" value={jobId} />
                  <input type="hidden" name="takeoffId" value={takeoffId} />
                  <input type="hidden" name="fileId" value={plan.id} />
                  <button
                    type="submit"
                    className="text-xs font-medium text-[var(--bt-muted)] hover:text-[var(--bt-hazard)]"
                  >
                    Remove from takeoff
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}

      {availablePlans.length > 0 ? (
        <p className="text-xs text-[var(--bt-muted)]">
          {availablePlans.length} plan{availablePlans.length === 1 ? "" : "s"} available on{" "}
          <Link href={`/jobs/${jobId}/plans-and-specs`} className="text-[var(--bt-primary)] hover:underline">
            Plans &amp; Specs
          </Link>{" "}
          to import.
        </p>
      ) : null}
    </section>
  );
}
