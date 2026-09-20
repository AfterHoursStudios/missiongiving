/**
 * Deterministic FAKE data for development and demos. Every name is prefixed "[SAMPLE]", every email uses the reserved
 * example.test domain, and every donation note says SAMPLE DATA. No real donor information is used or implied.
 */
export interface SampleDonor { email: string; first_name: string; last_name: string; region: string; marketing: boolean; updates: boolean }
export interface SampleDonation {
  donorIndex: number; amount_cents: number; fee_cents: number; refunded_cents: number; frequency: "one_time" | "monthly" | "yearly";
  payment_method: "card" | "us_bank_account"; status: "succeeded" | "pending" | "processing" | "failed" | "partially_refunded" | "refunded" | "disputed";
  donated_at: string; settled_at: string | null; project: boolean;
}
export interface SampleExpense { expense_date: string; vendor: string; description: string; amount_cents: number; categoryName: string; approval: "approved" | "pending"; project: boolean }

export const SAMPLE_EMAIL_PATTERN = "sample-%@example.test";

function rng(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
}

const FIRST = ["Avery", "Blake", "Casey", "Dana", "Emery", "Finley", "Harper", "Jordan"];
const LAST = ["Sample", "Example", "Testerson", "Demoware", "Placeholder", "Mockson", "Fakename", "Trial"];

export function generateSample(now: Date, seed = 42) {
  const r = rng(seed);
  const pick = <T,>(a: readonly T[]) => a[Math.floor(r() * a.length)];
  const donors: SampleDonor[] = FIRST.map((f, i) => ({
    email: `sample-${i + 1}@example.test`, first_name: `[SAMPLE] ${f}`, last_name: LAST[i], region: pick(["OR", "WA", "CA"]),
    marketing: i % 2 === 0, updates: i % 3 !== 0,
  }));

  const donations: SampleDonation[] = [];
  const tiers = [1000, 2500, 5000, 7500, 10000];
  for (let m = 13; m >= 0; m--) {
    const count = 2 + Math.floor(r() * 4);
    for (let k = 0; k < count; k++) {
      const donorIndex = Math.floor(r() * donors.length);
      const amount = pick(tiers);
      const at = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - m, 1 + Math.floor(r() * 26), 15));
      if (at > now) continue;
      const ach = r() < 0.3;
      const roll = r();
      const recent = now.getTime() - at.getTime() < 5 * 86_400_000;
      let status: SampleDonation["status"] = "succeeded";
      if (recent && ach) status = r() < 0.5 ? "processing" : "pending";
      else if (roll > 0.94) status = "failed";
      else if (roll > 0.9) status = "partially_refunded";
      else if (roll > 0.88) status = "refunded";
      else if (roll > 0.87) status = "disputed";
      const settled = ["succeeded", "partially_refunded", "refunded", "disputed"].includes(status);
      const refunded = status === "refunded" ? amount : status === "partially_refunded" ? Math.round(amount / 4 / 100) * 100 || 100 : 0;
      donations.push({
        donorIndex, amount_cents: amount, refunded_cents: refunded,
        fee_cents: settled ? Math.round(amount * (ach ? 0.008 : 0.029) + (ach ? 0 : 30)) : 0,
        frequency: r() < 0.25 ? "monthly" : r() < 0.1 ? "yearly" : "one_time", payment_method: ach ? "us_bank_account" : "card", status,
        donated_at: at.toISOString(), settled_at: settled ? new Date(at.getTime() + (ach ? 4 * 86_400_000 : 0)).toISOString() : null, project: r() < 0.4,
      });
    }
  }

  const expenses: SampleExpense[] = [];
  const cats = ["Program Services", "Fundraising", "Management & General", "Travel", "Supplies"];
  for (let m = 11; m >= 0; m--) {
    const n = 1 + Math.floor(r() * 3);
    for (let k = 0; k < n; k++) {
      const at = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - m, 3 + Math.floor(r() * 24)));
      if (at > now) continue;
      expenses.push({
        expense_date: at.toISOString().slice(0, 10), vendor: `[SAMPLE] Vendor ${1 + Math.floor(r() * 5)}`, description: "SAMPLE DATA",
        amount_cents: (5 + Math.floor(r() * 90)) * 1000, categoryName: pick(cats), approval: m === 0 && r() < 0.5 ? "pending" : "approved", project: r() < 0.3,
      });
    }
  }
  return { donors, donations, expenses };
}
