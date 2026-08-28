"use client";

import { useActionState, useState } from "react";

import {
  addBulletAction,
  deleteBulletAction,
  deleteSectionAction,
  updateBulletAction,
  updateSectionTitleAction,
  type ActionState,
} from "./actions";

const INITIAL: ActionState = {};

export interface ProposalSectionData {
  readonly id: string;
  readonly title: string;
  readonly bullets: readonly { readonly id: string; readonly text: string }[];
}

function BulletRow({ proposalId, bulletId, text }: { proposalId: string; bulletId: string; text: string }) {
  const [editing, setEditing] = useState(false);
  const [state, formAction, pending] = useActionState(updateBulletAction, INITIAL);

  if (editing) {
    return (
      <form action={formAction} className="flex items-start gap-2">
        <input type="hidden" name="proposalId" value={proposalId} />
        <input type="hidden" name="bulletId" value={bulletId} />
        <textarea
          name="text"
          defaultValue={text}
          rows={2}
          className="flex-1 rounded border px-2 py-1 text-sm outline-none focus:border-[var(--bt-primary)]"
          style={{ borderColor: "var(--bt-border)" }}
        />
        <div className="flex flex-col gap-1">
          <button type="submit" disabled={pending} className="rounded px-2 py-1 text-xs font-semibold text-white disabled:opacity-50" style={{ background: "var(--bt-primary)" }}>
            {pending ? "…" : "Save"}
          </button>
          <button type="button" onClick={() => setEditing(false)} className="text-xs text-[var(--bt-muted)] hover:underline">
            Cancel
          </button>
        </div>
        {state.error ? <span className="text-xs text-red-600">{state.error}</span> : null}
      </form>
    );
  }

  return (
    <li className="group flex items-start justify-between gap-2 text-sm text-[var(--bt-text)]">
      <span>{text}</span>
      <span className="flex shrink-0 gap-2 text-xs opacity-0 group-hover:opacity-100">
        <button type="button" onClick={() => setEditing(true)} className="text-[var(--bt-primary)] hover:underline">
          Edit
        </button>
        <form action={deleteBulletAction}>
          <input type="hidden" name="proposalId" value={proposalId} />
          <input type="hidden" name="bulletId" value={bulletId} />
          <button type="submit" className="text-[var(--bt-muted)] hover:text-red-600 hover:underline">
            Remove
          </button>
        </form>
      </span>
    </li>
  );
}

function AddBulletForm({ proposalId, sectionId }: { proposalId: string; sectionId: string }) {
  const [state, formAction, pending] = useActionState(addBulletAction, INITIAL);

  return (
    <form action={formAction} className="mt-1 flex items-center gap-2">
      <input type="hidden" name="proposalId" value={proposalId} />
      <input type="hidden" name="sectionId" value={sectionId} />
      <input
        name="text"
        placeholder="Add a bullet…"
        className="flex-1 rounded border px-2 py-1 text-sm outline-none focus:border-[var(--bt-primary)]"
        style={{ borderColor: "var(--bt-border)" }}
      />
      <button type="submit" disabled={pending} className="rounded border px-2 py-1 text-xs font-medium text-[var(--bt-text)]" style={{ borderColor: "var(--bt-border)" }}>
        {pending ? "…" : "Add"}
      </button>
      {state.error ? <span className="text-xs text-red-600">{state.error}</span> : null}
    </form>
  );
}

export function ProposalSectionEditor({ proposalId, section }: { proposalId: string; section: ProposalSectionData }) {
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleState, titleAction, titlePending] = useActionState(updateSectionTitleAction, INITIAL);

  return (
    <div className="rounded border p-3" style={{ borderColor: "var(--bt-border)" }}>
      <div className="flex items-start justify-between gap-2">
        {editingTitle ? (
          <form action={titleAction} className="flex flex-1 items-center gap-2">
            <input type="hidden" name="proposalId" value={proposalId} />
            <input type="hidden" name="sectionId" value={section.id} />
            <input
              name="title"
              defaultValue={section.title}
              className="flex-1 rounded border px-2 py-1 text-sm font-semibold outline-none focus:border-[var(--bt-primary)]"
              style={{ borderColor: "var(--bt-border)" }}
            />
            <button type="submit" disabled={titlePending} className="text-xs font-semibold text-[var(--bt-primary)]">
              {titlePending ? "…" : "Save"}
            </button>
            <button type="button" onClick={() => setEditingTitle(false)} className="text-xs text-[var(--bt-muted)] hover:underline">
              Cancel
            </button>
          </form>
        ) : (
          <button type="button" onClick={() => setEditingTitle(true)} className="text-left text-sm font-semibold text-[var(--bt-text)] hover:underline">
            {section.title}
          </button>
        )}
        <form action={deleteSectionAction}>
          <input type="hidden" name="proposalId" value={proposalId} />
          <input type="hidden" name="sectionId" value={section.id} />
          <button type="submit" className="text-xs text-[var(--bt-muted)] hover:text-red-600 hover:underline">
            Remove section
          </button>
        </form>
      </div>
      {titleState.error ? <p className="mt-1 text-xs text-red-600">{titleState.error}</p> : null}

      <ul className="mt-2 flex flex-col gap-1.5">
        {section.bullets.map((bullet) => (
          <BulletRow key={bullet.id} proposalId={proposalId} bulletId={bullet.id} text={bullet.text} />
        ))}
      </ul>

      <AddBulletForm proposalId={proposalId} sectionId={section.id} />
    </div>
  );
}
