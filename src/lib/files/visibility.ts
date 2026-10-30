/**
 * Portal visibility defaults for Files / Folders.
 *
 * Inspection Pictures and Termite folders are internal by default (client and
 * sub false). Cost documents imported from Buildertrend (bills, receipts, signed
 * POs, proofs of purchase) are also internal — they must not ride the schema's
 * historical true/true default into the client portal.
 *
 * API byte-upload routes and the Inspection Pictures UI share DEFAULT_FILE_VISIBILITY
 * so a bot POST and a staff camera capture land with the same flags.
 */

export const DEFAULT_FILE_VISIBILITY = {
  clientVisible: false,
  subVisible: false,
} as const;

export const DEFAULT_DOCUMENT_FOLDER_VISIBILITY = {
  clientVisible: false,
  subVisible: false,
} as const;

export const DEFAULT_INTERNAL_FOLDER_VISIBILITY = {
  clientVisible: false,
  subVisible: false,
} as const;

/** Inspection Pictures (`Inspection: …`) or any Termite Certificates folder. */
export function isInternalFolderName(name: string): boolean {
  const normalized = name.replace(/\s+/g, " ").trim().toLowerCase();
  if (!normalized) return false;
  if (normalized.startsWith("inspection:")) return true;
  if (normalized.includes("termite")) return true;
  return false;
}

export function defaultFolderVisibility(name: string): {
  readonly clientVisible: boolean;
  readonly subVisible: boolean;
} {
  if (isInternalFolderName(name)) return DEFAULT_INTERNAL_FOLDER_VISIBILITY;
  return DEFAULT_DOCUMENT_FOLDER_VISIBILITY;
}

/**
 * Buildertrend media import stamped cost docs with names like
 * `doc-bills__…`, `doc-signed-purchase-orders-w__…`, `doc-proofs-of-purchase__…`.
 * Also catch common receipt / PO / bill filenames.
 */
export function isInternalCostDocumentFileName(fileName: string): boolean {
  const n = fileName.trim().toLowerCase();
  if (!n) return false;
  if (n.startsWith("doc-bills")) return true;
  if (n.startsWith("doc-signed-purchase")) return true;
  if (n.startsWith("doc-proofs-of-purchase")) return true;
  if (n.startsWith("doc-receipts")) return true;
  if (n.includes("proof-of-purchase") || n.includes("proofs-of-purchase")) return true;
  if (n.includes("purchase-order") || n.includes("purchase_order")) return true;
  if (/(^|[^a-z])(bill|bills|receipt|receipts|invoice-paid)([^a-z]|$)/i.test(n)) {
    // Avoid flagging everyday photos; require DOCUMENT-ish naming cues or PDF.
    if (n.endsWith(".pdf") || n.startsWith("doc-") || n.includes("turner_") || n.includes("permitrockstar")) {
      return true;
    }
  }
  if (n.startsWith("permitrockstar") && n.endsWith(".pdf")) return true;
  return false;
}
