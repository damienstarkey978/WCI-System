import { describe, expect, it } from "vitest";

import {
  NOT_IN_NOTES,
  normalizeSourceNote,
  resolveSourceNoteFromNotes,
} from "@/lib/estimates/source-note";

describe("estimate source note", () => {
  it("defaults empty to NOT IN NOTES", () => {
    expect(normalizeSourceNote(null)).toBe(NOT_IN_NOTES);
    expect(normalizeSourceNote("  ")).toBe(NOT_IN_NOTES);
  });

  it("keeps a model citation only when it appears in raw notes", () => {
    const notes = "Replace the garage door. Paint the exterior.";
    expect(
      resolveSourceNoteFromNotes({
        notes,
        title: "Garage door",
        modelSourceNote: "Replace the garage door.",
      }),
    ).toBe("Replace the garage door.");

    expect(
      resolveSourceNoteFromNotes({
        notes,
        title: "Garage door",
        modelSourceNote: "Invented paraphrase about doors",
      }),
    ).not.toBe("Invented paraphrase about doors");
  });

  it("returns NOT IN NOTES when nothing matches", () => {
    expect(
      resolveSourceNoteFromNotes({
        notes: "Client wants financing options only.",
        title: "Roof tear-off",
      }),
    ).toBe(NOT_IN_NOTES);
  });
});
