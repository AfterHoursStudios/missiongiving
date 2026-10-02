import { strFromU8, unzipSync } from "fflate";

/**
 * DonorPerfect import: reads a DonorPerfect constituent export (.xlsx) and maps each row to a donor record.
 * Works with the list-view export (name, ID, score, gift totals) and with fuller exports that add email, phone and
 * address columns. Pure functions; the database writes live in scripts/import-donorperfect.mts.
 */

/** Rows of the first worksheet as strings (header row first). Handles shared strings, inline strings and numbers. */
export function readXlsx(data: Uint8Array): string[][] {
  const files = unzipSync(data, { filter: (f) => f.name === "xl/sharedStrings.xml" || /^xl\/worksheets\/sheet\d+\.xml$/.test(f.name) });
  const sheetName = Object.keys(files).filter((n) => n.startsWith("xl/worksheets/")).sort()[0];
  if (!sheetName) throw new Error("No worksheet found in the file.");
  const text = (xml: string) => decodeXml([...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => m[1]).join(""));
  const shared = files["xl/sharedStrings.xml"] ? [...strFromU8(files["xl/sharedStrings.xml"]).matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => text(m[1])) : [];

  const rows: string[][] = [];
  for (const rowXml of strFromU8(files[sheetName]).matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const row: string[] = [];
    for (const c of rowXml[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = c[1], body = c[2] ?? "";
      const ref = /\br="([A-Z]+)\d+"/.exec(attrs)?.[1];
      const type = /\bt="(\w+)"/.exec(attrs)?.[1];
      const v = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
      const value = type === "inlineStr" ? text(body) : v === undefined ? "" : type === "s" ? shared[Number(v)] ?? "" : decodeXml(v);
      row[ref ? colIndex(ref) : row.length] = value;
    }
    if (row.some((v) => v?.trim())) rows.push(Array.from(row, (v) => v ?? ""));
  }
  return rows;
}

const colIndex = (letters: string) => [...letters].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
const decodeXml = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d))).replace(/&amp;/g, "&");

export interface ImportDonor {
  dpId: string; firstName: string; lastName: string; organizationName: string | null; email: string | null;
  phone: string | null; address1: string | null; address2: string | null; city: string | null; region: string | null; postalCode: string | null; country: string | null;
  score: number | null; totalGivenCents: number; giftCount: number; lastGiftAt: string | null; lastGiftCents: number | null;
}
export interface ImportResult { donors: ImportDonor[]; skipped: { row: number; reason: string }[]; columns: Record<string, string> }

/** Accepted header spellings (lower-cased, spaces collapsed) for each field. */
const HEADERS: Record<keyof ImportDonor | "fullName" | "optionalLine", string[]> = {
  dpId: ["id", "donor id", "donor_id", "constituent id"],
  fullName: ["donor name", "full name", "name", "constituent name"],
  firstName: ["first name", "first_name", "first"],
  lastName: ["last name", "last_name", "last"],
  organizationName: ["organization", "organization name", "org name", "company"],
  optionalLine: ["optional line", "optional_line"],
  email: ["email", "e-mail", "email address"],
  phone: ["mobile phone", "phone", "home phone", "business phone", "mobile_phone", "home_phone"],
  address1: ["address", "address 1", "address1", "street"],
  address2: ["address 2", "address2"],
  city: ["city"], region: ["state", "region", "province"], postalCode: ["zip", "zip code", "postal code", "postal"], country: ["country"],
  score: ["score", "donor score"],
  totalGivenCents: ["total given", "lifetime gift total", "lifetime giving"],
  giftCount: ["total gifts", "number of gifts", "gift count"],
  lastGiftAt: ["last gift date", "last_gift_date"],
  lastGiftCents: ["last gift amount", "last_gift_amount"],
};

const ORG_WORDS = /\b(church|fellowship|foundation|trust|inc|llc|ltd|corp|company|ministr(y|ies)|school|academy|association|assoc|fund|giving|group|society|conference|union|hospital|clinic|service|services|industr(y|ies)|written|daf|sda|club|dept|department|outreach|bible study|revenue)\b/i;
const SUFFIX = /^(jr|sr|ii|iii|iv|md|phd|dds)\.?$/i;
/** Surname particles that belong with the last name: "Becky St. Clair", "Brian La Tour", "Nancy Delos Reyes". */
const PARTICLE = /^(st\.?|la|le|de|del|della|delos|der|da|di|du|van|von|mac)$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Splits "Charles & Kelley Downing" → first "Charles & Kelley", last "Downing"; keeps suffixes with the last name. */
export function splitName(full: string): { first: string; last: string } {
  const parts = full.trim().split(/\s+/);
  if (parts.length === 1) return { first: "", last: parts[0] };
  let lastStart = parts.length - 1;
  if (SUFFIX.test(parts[lastStart]) && lastStart > 1) lastStart--;
  while (lastStart > 1 && PARTICLE.test(parts[lastStart - 1])) lastStart--;
  return { first: parts.slice(0, lastStart).join(" "), last: parts.slice(lastStart).join(" ") };
}

export const isOrganizationName = (name: string) => ORG_WORDS.test(name);

const cents = (v: string) => { const n = Number(String(v).replace(/[$,\s]/g, "")); return Number.isFinite(n) && v.trim() !== "" ? Math.round(n * 100) : null; };
const int = (v: string) => { const n = Number(String(v).replace(/[,\s]/g, "")); return Number.isFinite(n) && v.trim() !== "" ? Math.round(n) : null; };

/** An Excel date serial (e.g. 46268) or an ISO / US date string → YYYY-MM-DD. */
export function toIsoDate(v: string): string | null {
  const s = v.trim();
  if (!s) return null;
  if (/^\d+(\.\d+)?$/.test(s)) { const d = new Date(Date.UTC(1899, 11, 30) + Number(s) * 86_400_000); return d.toISOString().slice(0, 10); }
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s); if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s); if (us) return `${us[3]}-${us[1].padStart(2, "0")}-${us[2].padStart(2, "0")}`;
  return null;
}

/** Maps the sheet's rows (header first) to donors. Rows without an ID or a name are skipped with a reason. */
export function mapRows(rows: string[][]): ImportResult {
  const [header = [], ...body] = rows;
  const norm = header.map((h) => h.trim().toLowerCase().replace(/\s+/g, " "));
  const idx = {} as Record<keyof typeof HEADERS, number>;
  const columns: Record<string, string> = {};
  for (const [field, names] of Object.entries(HEADERS) as [keyof typeof HEADERS, string[]][]) {
    const i = names.map((n) => norm.indexOf(n)).find((i) => i >= 0) ?? -1;
    idx[field] = i;
    if (i >= 0) columns[field] = header[i];
  }
  if (idx.dpId < 0) throw new Error(`No ID column found. Columns in the file: ${header.join(", ")}`);
  if (idx.fullName < 0 && idx.lastName < 0) throw new Error(`No name column found. Columns in the file: ${header.join(", ")}`);

  const get = (r: string[], f: keyof typeof HEADERS) => (idx[f] >= 0 ? String(r[idx[f]] ?? "").trim() : "");
  const donors: ImportDonor[] = [];
  const skipped: ImportResult["skipped"] = [];
  const seen = new Set<string>();
  body.forEach((r, i) => {
    const row = i + 2; // spreadsheet row number
    const dpId = get(r, "dpId");
    if (!dpId) return skipped.push({ row, reason: "no ID" });
    if (seen.has(dpId)) return skipped.push({ row, reason: `duplicate ID ${dpId}` });
    const full = get(r, "fullName") || [get(r, "firstName"), get(r, "lastName")].filter(Boolean).join(" ");
    if (!full) return skipped.push({ row, reason: "no name" });
    seen.add(dpId);

    const org = get(r, "organizationName") || (isOrganizationName(full) && !get(r, "firstName") ? full : "");
    const split = get(r, "lastName") ? { first: get(r, "firstName"), last: get(r, "lastName") } : org === full ? { first: "", last: full } : splitName(full);
    const email = get(r, "email").toLowerCase();
    const opt = get(r, "optionalLine");
    donors.push({
      dpId, firstName: split.first, lastName: split.last, organizationName: org || (opt && isOrganizationName(opt) ? opt : null),
      email: EMAIL.test(email) ? email : null, phone: get(r, "phone") || null,
      address1: get(r, "address1") || null, address2: get(r, "address2") || null, city: get(r, "city") || null,
      region: get(r, "region") || null, postalCode: get(r, "postalCode") || null, country: get(r, "country").toUpperCase().slice(0, 2) || null,
      score: int(get(r, "score")), totalGivenCents: cents(get(r, "totalGivenCents")) ?? 0, giftCount: int(get(r, "giftCount")) ?? 0,
      lastGiftAt: toIsoDate(get(r, "lastGiftAt")), lastGiftCents: cents(get(r, "lastGiftCents")),
    });
  });
  return { donors, skipped, columns };
}

/** Internal address for an imported donor with no email: never emailed (see sendEmail) and replaceable by staff. */
export const placeholderEmail = (dpId: string) => `dp-${dpId.replace(/[^\w-]/g, "")}@no-email.invalid`;
export const isPlaceholderEmail = (email: string | null | undefined) => !!email && email.endsWith("@no-email.invalid");
