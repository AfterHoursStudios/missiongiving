/**
 * Shared helpers for the DonorPerfect Report Builder CSV imports (scripts/import-donorperfect-gifts.mts and
 * scripts/import-donorperfect-pledges.mts): CSV parsing, DonorPerfect's date and money formats, and the mapping from
 * DonorPerfect General Ledger codes to Mission Giving designations.
 */

/** DonorPerfect General Ledger code → Mission Giving designation (project title). null = General Fund. */
export const SPONSORSHIP_DESIGNATION = "Sponsorship (DonorPerfect)";
export const GL_TO_PROJECT: Record<string, string | null> = {
  "": null, UN: null, RECURINGSPONSOR: SPONSORSHIP_DESIGNATION, SPONSORHHBW: SPONSORSHIP_DESIGNATION,
  MISSIONTRIPS: "Mission Trips", EVERYGIRL: "Every Girl Project", MADIDROPS: "MadiDrops", EDUCATION: "Education",
  GOODSAMARITAN: "Good Samaritan", HAVAC: "Hills & Valleys", BAMBOOCHURCH: "Bamboo Church",
  NEIGHBORHOODCONNECTION: "Neighborhood Connection", EBOLARESPONCE: "Ebola Response", EVANGELISM: "Evangelism",
};

/** RFC 4180 CSV (quoted fields, doubled quotes, CRLF), with any byte-order mark removed. Blank lines are dropped. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = "", quoted = false;
  const t = text.replace(/^﻿/, "");
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (quoted) {
      if (c === '"') { if (t[i + 1] === '"') { field += '"'; i++; } else quoted = false; } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field.replace(/\r$/, "")); rows.push(row); row = []; field = ""; }
    else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((v) => v.trim()));
}

/** Column index by DonorPerfect field name (e.g. "GIFT_ID"); throws with the available columns when it's missing. */
export function columnOf(header: string[], name: string): number {
  const i = header.findIndex((h) => h.trim().toUpperCase() === name);
  if (i < 0) throw new Error(`Column ${name} not found. Columns: ${header.join(", ")}`);
  return i;
}

/** DonorPerfect's "MM/DD/YYYY" → "YYYY-MM-DD", or null. */
export const dpDate = (s: string | undefined) => {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec((s ?? "").trim());
  return m ? `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}` : null;
};

/** DonorPerfect money ("$1,000.00", "-$6.99", "($6.99)") → integer cents, or NaN. */
export const dpCents = (s: string | undefined) => {
  const v = (s ?? "").trim();
  const neg = /^\(.*\)$/.test(v) || v.includes("-");
  const n = Number(v.replace(/[$,()\s-]/g, ""));
  return v && Number.isFinite(n) ? Math.round(n * 100) * (neg ? -1 : 1) : NaN;
};

/** DonorPerfect pledge frequency code → Mission Giving frequency (M monthly, A annual, BW bi-weekly, U "unusual payment schedule"). */
export function dpFrequency(code: string | undefined): "monthly" | "yearly" | "biweekly" | "irregular" {
  const c = (code ?? "").trim().toUpperCase();
  if (["A", "Y", "ANNUAL", "YEARLY"].includes(c)) return "yearly";
  if (["BW", "BIWEEKLY"].includes(c)) return "biweekly";
  if (["U", "UNUSUAL", "IRREGULAR"].includes(c)) return "irregular";
  return "monthly";
}
