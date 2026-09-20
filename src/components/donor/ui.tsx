import { cn } from "@/lib/utils";
import { STATUS_LABELS, type DonationStatus } from "@/lib/donations/status";

const TONE: Record<DonationStatus, string> = {
  succeeded: "bg-success-bg text-success",
  pending: "bg-info-bg text-info", processing: "bg-info-bg text-info",
  failed: "bg-danger-bg text-danger", disputed: "bg-danger-bg text-danger",
  refunded: "bg-warning-bg text-warning", partially_refunded: "bg-warning-bg text-warning",
  canceled: "bg-paper-2 text-ink-soft",
};

/** Status is conveyed by text, not color alone. */
export function StatusBadge({ status }: { status: string }) {
  const s = status as DonationStatus;
  return <span className={cn("inline-block rounded px-2 py-0.5 text-sm font-semibold", TONE[s] ?? "bg-paper-2")}>{STATUS_LABELS[s] ?? status}</span>;
}

export function Empty({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="border-y border-line py-10 text-center">
      <p className="font-display text-xl font-semibold">{title}</p>
      {children && <div className="mt-2 text-ink-soft">{children}</div>}
    </div>
  );
}

export function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div>
      <dt className="text-sm text-ink-soft">{label}</dt>
      <dd className="font-display text-3xl font-semibold text-brand-800">{value}</dd>
      {hint && <p className="text-sm text-ink-soft">{hint}</p>}
    </div>
  );
}

export const FREQUENCY_LABEL: Record<string, string> = { one_time: "One time", monthly: "Monthly", yearly: "Yearly" };
export const METHOD_LABEL: Record<string, string> = { card: "Card", us_bank_account: "Bank (ACH)", offline: "Offline" };
