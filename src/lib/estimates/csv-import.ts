/**
 * CSV import — CLAUDE.md 3's "import" Estimate entry method. Expects a header
 * row with (case-insensitive) columns: Cost Code, Title, Quantity, Unit Cost
 * ("Quantity" is optional, defaulting to 1). Cost Code is the human-readable
 * CostCode.code (e.g. "01-100"), resolved against this organization's cost
 * codes — never an internal id, since a spreadsheet export has no way to know
 * those.
 */

import type { CreateEstimateLineItemInput } from "@/lib/estimates/service";
import { db } from "@/lib/db";
import { MoneyError, parseDollarsToCents } from "@/lib/money";

export class InvalidCsvError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidCsvError";
  }
}

export class UnknownCostCodesInCsvError extends Error {
  constructor(public readonly unknownCodes: readonly string[]) {
    super(`Unknown cost code(s) in CSV: ${unknownCodes.join(", ")}`);
    this.name = "UnknownCostCodesInCsvError";
  }
}

// Minimal CSV split: no quoted-comma support — good enough for a plain
// Cost Code/Title/Quantity/Unit Cost export, not a general CSV parser.
function splitCsvLine(line: string): string[] {
  return line.split(",").map((cell) => cell.trim().replace(/^"|"$/g, ""));
}

interface RawRow {
  readonly costCode: string;
  readonly title: string;
  readonly quantityMilli: number;
  readonly unitCostCents: number;
}

export async function parseEstimateCsv(organizationId: string, csvText: string): Promise<CreateEstimateLineItemInput[]> {
  const lines = csvText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length < 2) throw new InvalidCsvError("CSV needs a header row and at least one data row.");

  const header = splitCsvLine(lines[0]).map((cell) => cell.toLowerCase());
  const costCodeIdx = header.indexOf("cost code");
  const titleIdx = header.indexOf("title");
  const quantityIdx = header.indexOf("quantity");
  const unitCostIdx = header.indexOf("unit cost");
  if (costCodeIdx === -1 || titleIdx === -1 || unitCostIdx === -1) {
    throw new InvalidCsvError('CSV header must include "Cost Code", "Title", and "Unit Cost" columns (optionally "Quantity").');
  }

  const rawRows: RawRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]);
    const costCode = cells[costCodeIdx]?.trim();
    const title = cells[titleIdx]?.trim();
    const unitCostRaw = cells[unitCostIdx]?.trim();
    if (!costCode || !title || !unitCostRaw) {
      throw new InvalidCsvError(`Row ${i + 1}: missing Cost Code, Title, or Unit Cost.`);
    }

    const quantityRaw = (quantityIdx === -1 ? "" : cells[quantityIdx]?.trim()) || "1";
    const quantityMilli = Math.round(Number(quantityRaw) * 1000);
    if (!Number.isFinite(quantityMilli) || quantityMilli <= 0) {
      throw new InvalidCsvError(`Row ${i + 1}: cannot parse "${quantityRaw}" as a quantity.`);
    }

    let unitCostCents: number;
    try {
      unitCostCents = parseDollarsToCents(unitCostRaw);
    } catch (error) {
      if (error instanceof MoneyError) throw new InvalidCsvError(`Row ${i + 1}: ${error.message}`);
      throw error;
    }

    rawRows.push({ costCode, title, quantityMilli, unitCostCents });
  }

  const costCodes = await db.costCode.findMany({
    where: { organizationId, code: { in: rawRows.map((row) => row.costCode) } },
    select: { id: true, code: true },
  });
  const idByCode = new Map(costCodes.map((code) => [code.code.toLowerCase(), code.id]));
  const unknown = [...new Set(rawRows.map((row) => row.costCode).filter((code) => !idByCode.has(code.toLowerCase())))];
  if (unknown.length > 0) throw new UnknownCostCodesInCsvError(unknown);

  return rawRows.map((row) => ({
    costCodeId: idByCode.get(row.costCode.toLowerCase())!,
    title: row.title,
    quantityMilli: row.quantityMilli,
    unitCostCents: row.unitCostCents,
  }));
}
