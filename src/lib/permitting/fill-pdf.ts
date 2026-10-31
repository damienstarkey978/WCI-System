/**
 * Fill official Jacksonville AcroForm blanks with package field values.
 * Only writes into existing AcroForm fields — never invents form wording or overlays.
 */

import { readFileSync } from "node:fs";

import { PDFDocument, type PDFForm } from "pdf-lib";

import { officialBlankPathForKey } from "@/lib/permitting/form-manifest";

export class PermitPdfFillError extends Error {
  constructor(
    message: string,
    readonly code: "unavailable" | "fill_failed" = "fill_failed",
  ) {
    super(message);
    this.name = "PermitPdfFillError";
  }
}

export type PdfFieldWrites = {
  readonly text?: Readonly<Record<string, string>>;
  readonly checks?: Readonly<Record<string, boolean>>;
};

function setTextSafe(form: PDFForm, name: string, value: string): void {
  if (!value) return;
  try {
    const field = form.getTextField(name);
    field.setText(value.slice(0, 500));
  } catch {
    // Official field names are imperfect OCR truncations — skip unknown names.
  }
}

function setCheckSafe(form: PDFForm, name: string, on: boolean): void {
  try {
    const field = form.getCheckBox(name);
    if (on) field.check();
    else field.uncheck();
  } catch {
    // ignore
  }
}

export async function fillOfficialPermitPdf(
  formKey: string,
  writes: PdfFieldWrites,
): Promise<Uint8Array> {
  const blankPath = officialBlankPathForKey(formKey);
  if (!blankPath) {
    throw new PermitPdfFillError(
      `Official PDF for "${formKey}" is not sourced yet.`,
      "unavailable",
    );
  }

  const bytes = readFileSync(blankPath);
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const form = doc.getForm();

  for (const [name, value] of Object.entries(writes.text ?? {})) {
    setTextSafe(form, name, value);
  }
  for (const [name, on] of Object.entries(writes.checks ?? {})) {
    setCheckSafe(form, name, on);
  }

  // Flatten is intentionally NOT applied — staff may still edit / sign in Acrobat.
  return doc.save({ updateFieldAppearances: true });
}
