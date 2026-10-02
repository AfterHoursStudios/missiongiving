/**
 * "Last, First" for lists ("Downing, Charles"). An organization or single-name record (no first name) shows just its
 * name ("Village SDA Church").
 */
export function lastFirst(first: string | null | undefined, last: string | null | undefined): string {
  const f = (first ?? "").trim(), l = (last ?? "").trim();
  return f && l ? `${l}, ${f}` : l || f;
}
