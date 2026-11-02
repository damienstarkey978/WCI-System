/**
 * Energy Form R402 (Florida Building Code) — official blank has no AcroForm.
 * Staff enter worksheet values into package fieldValues; we prepend a WCI cover
 * page summarizing those values, then append the official blank pages.
 * Never invent climate zone / SF / systems — empty fields stay blank on the cover.
 */

import { readFileSync } from "node:fs";

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

import { officialBlankPathForKey } from "@/lib/permitting/form-manifest";
import type { PackageFillContext } from "@/lib/permitting/package-form-fill";

export const R402_FORM_KEY = "energy_form_r402" as const;

export type R402WorksheetFields = {
  readonly climateZone: string;
  readonly conditionedSqFt: string;
  readonly projectScope: string;
  readonly mechanicalSystem: string;
  readonly insulationNotes: string;
  readonly otherNotes: string;
};

export function r402FieldsFromBag(bag: Record<string, unknown>): R402WorksheetFields {
  const str = (key: string) => {
    const v = bag[key];
    return typeof v === "string" ? v.trim() : "";
  };
  return {
    climateZone: str("r402ClimateZone"),
    conditionedSqFt: str("r402ConditionedSqFt"),
    projectScope: str("r402ProjectScope"),
    mechanicalSystem: str("r402MechanicalSystem"),
    insulationNotes: str("r402InsulationNotes"),
    otherNotes: str("r402OtherNotes"),
  };
}

export function r402FieldsFromContext(ctx: PackageFillContext): R402WorksheetFields {
  return {
    climateZone: (ctx.r402ClimateZone ?? "").trim(),
    conditionedSqFt: (ctx.r402ConditionedSqFt ?? "").trim(),
    projectScope: (ctx.r402ProjectScope ?? "").trim(),
    mechanicalSystem: (ctx.r402MechanicalSystem ?? "").trim(),
    insulationNotes: (ctx.r402InsulationNotes ?? "").trim(),
    otherNotes: (ctx.r402OtherNotes ?? "").trim(),
  };
}

export function r402WorksheetHasStaffValues(fields: R402WorksheetFields): boolean {
  return Object.values(fields).some((v) => Boolean(v.trim()));
}

/**
 * Official R402 blank + optional WCI cover summarizing staff worksheet values.
 * Cover never invents statutory energy-code wording — only echoes staff input
 * and package/parcel identity already on the package.
 */
export async function composeR402PackagePdf(
  ctx: PackageFillContext,
  worksheet: R402WorksheetFields,
): Promise<Uint8Array> {
  const blankPath = officialBlankPathForKey(R402_FORM_KEY);
  if (!blankPath) {
    throw new Error(`Official PDF for "${R402_FORM_KEY}" is not sourced yet.`);
  }

  const blankBytes = readFileSync(blankPath);
  const blankDoc = await PDFDocument.load(blankBytes, { ignoreEncryption: true });
  const out = await PDFDocument.create();

  const cover = out.addPage([612, 792]);
  const font = await out.embedFont(StandardFonts.Helvetica);
  const bold = await out.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.12, 0.14, 0.18);
  const muted = rgb(0.35, 0.38, 0.42);
  let y = 752;

  const line = (text: string, opts?: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb> }) => {
    const size = opts?.size ?? 11;
    cover.drawText(text.slice(0, 110), {
      x: 48,
      y,
      size,
      font: opts?.bold ? bold : font,
      color: opts?.color ?? ink,
    });
    y -= size + 6;
  };

  line("WCI OS — Energy Form R402 worksheet cover", { size: 14, bold: true });
  line("Official Florida Form R402 blank follows. No AcroForm fields on the city PDF.", {
    size: 9,
    color: muted,
  });
  y -= 8;
  line(`Package: ${ctx.packageName || "—"}`, { bold: true });
  line(`Project address: ${ctx.propertyAddress || "—"}`);
  line(`Tax folio: ${ctx.taxFolio || "—"}`);
  line(`Owner: ${ctx.owner.name || "—"}`);
  y -= 10;
  line("Staff-entered worksheet (never auto-invented)", { bold: true, size: 12 });
  const rows: readonly (readonly [string, string])[] = [
    ["Climate zone", worksheet.climateZone],
    ["Conditioned area (SF)", worksheet.conditionedSqFt],
    ["Project scope", worksheet.projectScope],
    ["Mechanical system", worksheet.mechanicalSystem],
    ["Insulation notes", worksheet.insulationNotes],
    ["Other notes", worksheet.otherNotes],
  ];
  for (const [label, value] of rows) {
    line(`${label}: ${value || "(not entered)"}`, {
      size: 10,
      color: value ? ink : muted,
    });
  }
  y -= 12;
  line(
    r402WorksheetHasStaffValues(worksheet)
      ? "Transfer these values onto the official R402 pages as required by the AHJ."
      : "No worksheet values yet — enter them on the package panel before treating this as complete.",
    { size: 9, color: muted },
  );
  line("WCI does not submit this form to the city.", { size: 9, color: muted });

  const pages = await out.copyPages(blankDoc, blankDoc.getPageIndices());
  for (const page of pages) out.addPage(page);

  return out.save();
}
