/** Gift frequencies and how they read. Online giving offers one_time, monthly and yearly; biweekly and irregular come from DonorPerfect pledges. */
export const FREQUENCY_LABELS: Record<string, string> = {
  one_time: "One time", monthly: "Monthly", yearly: "Yearly", biweekly: "Bi-weekly", irregular: "Irregular schedule",
};

/**
 * A recurring gift's value per month, for "monthly recurring" totals: bi-weekly is 26 payments a year; an irregular
 * schedule is counted like monthly (its billing amount is per payment); yearly is not included (it has its own total).
 */
export function monthlyEquivalentCents(amountCents: number, frequency: string): number {
  if (frequency === "biweekly") return Math.round((amountCents * 26) / 12);
  if (frequency === "monthly" || frequency === "irregular") return amountCents;
  return 0;
}
