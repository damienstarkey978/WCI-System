/** Sorting for DataGrid, kept pure so it can be unit-tested without rendering. */

export type SortDirection = "asc" | "desc";
export type SortableValue = string | number | null;

/** Numbers sort numerically, strings with natural ordering ("PO 2" before "PO 10"), blanks last either way. */
export function sortRows<T>(rows: readonly T[], valueOf: (row: T) => SortableValue, direction: SortDirection): T[] {
  const sign = direction === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const left = valueOf(a);
    const right = valueOf(b);
    if (left === null && right === null) return 0;
    if (left === null) return 1;
    if (right === null) return -1;
    if (typeof left === "number" && typeof right === "number") return (left - right) * sign;
    return String(left).localeCompare(String(right), undefined, { numeric: true, sensitivity: "base" }) * sign;
  });
}
