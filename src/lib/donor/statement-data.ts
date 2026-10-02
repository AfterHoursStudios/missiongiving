import "server-only";
import { getDonorContext } from "./context";
import type { StatementDonation } from "@/lib/statements";
import { designationLabels } from "@/lib/donations/designation";

export async function loadStatementRows(): Promise<StatementDonation[]> {
  const { supabase, donor } = await getDonorContext();
  if (!donor) return [];
  const { data } = await supabase.from("donations")
    .select("id, status, amount_cents, refunded_cents, donated_at, settled_at, project_id, receipts(receipt_number)")
    .eq("donor_id", donor.id);
  const labels = await designationLabels((data ?? []).map((d) => d.project_id));
  return (data ?? []).map((d) => {
    const rc = Array.isArray(d.receipts) ? d.receipts[0] : d.receipts;
    return {
      id: d.id, status: d.status, amount_cents: d.amount_cents, refunded_cents: d.refunded_cents,
      donated_at: d.donated_at, settled_at: d.settled_at,
      designation: d.project_id ? labels.get(d.project_id) ?? "General Fund" : "General Fund",
      receipt_number: (rc as { receipt_number: string } | null)?.receipt_number ?? null,
    };
  });
}
