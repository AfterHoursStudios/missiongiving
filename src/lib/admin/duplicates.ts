export interface DupCandidate {
  id: string; first_name: string; last_name: string; email: string; phone: string | null;
  postal_code?: string | null; created_at: string;
}
export interface DupGroup { reason: "email" | "phone" | "name_postal"; key: string; donors: DupCandidate[] }

/** Lowercase, trim, and collapse Gmail-style dots/plus-tags only for gmail.com (other providers may treat them as distinct). */
export function normalizeEmail(email: string): string {
  const e = email.trim().toLowerCase();
  const [local, domain] = e.split("@");
  if (!domain) return e;
  if (domain === "gmail.com" || domain === "googlemail.com") return `${local.split("+")[0].replace(/\./g, "")}@gmail.com`;
  return e;
}
export const normalizePhone = (p: string | null | undefined) => {
  const d = (p ?? "").replace(/\D/g, "");
  return d.length >= 10 ? d.slice(-10) : "";
};
const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");

/**
 * Safe matching only: exact normalized email, exact 10-digit phone, or same full name + postal code.
 * A name alone is never enough (common names would create false merges). Results are suggestions for a
 * human to review, never automatic merges.
 */
export function findDuplicateGroups(donors: DupCandidate[]): DupGroup[] {
  const rules: { reason: DupGroup["reason"]; key: (d: DupCandidate) => string }[] = [
    { reason: "email", key: (d) => normalizeEmail(d.email) },
    { reason: "phone", key: (d) => normalizePhone(d.phone) },
    { reason: "name_postal", key: (d) => (d.postal_code && norm(d.first_name) && norm(d.last_name) ? `${norm(d.first_name)}|${norm(d.last_name)}|${norm(d.postal_code)}` : "") },
  ];
  const seen = new Set<string>();
  const groups: DupGroup[] = [];
  for (const rule of rules) {
    const buckets = new Map<string, DupCandidate[]>();
    for (const d of donors) {
      const k = rule.key(d);
      if (k) buckets.set(k, [...(buckets.get(k) ?? []), d]);
    }
    for (const [key, list] of buckets) {
      if (list.length < 2) continue;
      const sig = list.map((d) => d.id).sort().join(",");
      if (seen.has(sig)) continue; // same set already reported under a stronger rule
      seen.add(sig);
      groups.push({ reason: rule.reason, key, donors: [...list].sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at)) });
    }
  }
  return groups;
}
