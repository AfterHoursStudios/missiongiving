import { Check } from "lucide-react";
import { removePaymentMethod, setDefaultPaymentMethod, type SetupResult } from "@/lib/admin/payment-method-actions";
import type { SavedPaymentMethod } from "@/lib/admin/payment-on-file";
import { PaymentMethodForm } from "@/components/admin/payment-method-form";
import { ConfirmAction, InlineAction } from "./client";
import { ListPanel, tdCls, thCls } from "./ui";

const date = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" });

/** Saved cards and bank accounts, read live from Stripe. Only the brand, last four digits and expiry are ever shown. */
export function AccountsTab({ donorId, methods, error, canChange, publishableKey, setupResult }: {
  donorId: string; methods: SavedPaymentMethod[]; error?: string; canChange: boolean; publishableKey: string | null;
  setupResult: SetupResult | null;
}) {
  return (
    <ListPanel title="Account List" total={methods.length} actions={canChange && <PaymentMethodForm donorId={donorId} publishableKey={publishableKey} />}>
      {setupResult && (setupResult.pendingVerification ? (
        <div role="alert" className="bg-info-bg px-4 py-3 text-sm text-info">
          <p className="font-semibold">Bank account added — waiting for verification.</p>
          <p className="mt-1">Stripe is sending two small deposits to the account (1–2 business days). Once the donor confirms the amounts, the account appears here and can be charged or made the default.</p>
          {setupResult.pendingVerification.url && (
            <p className="mt-1">Send the donor this link to enter the amounts: <a className="break-all font-semibold underline" href={setupResult.pendingVerification.url} target="_blank" rel="noopener">{setupResult.pendingVerification.url}</a></p>
          )}
        </div>
      ) : (
        <p role="alert" className={`px-4 py-2 text-sm ${setupResult.ok ? "bg-success-bg text-success" : "bg-danger-bg text-danger"}`}>
          {setupResult.ok ? "Payment method saved and set as the default." : setupResult.error}
        </p>
      ))}
      {error && <p className="bg-warning-bg px-4 py-2 text-sm text-warning">{error}</p>}
      {methods.length === 0 ? <p className="px-4 py-10 text-center text-ink-soft">No saved payment methods.</p> : (
        <table className="w-full min-w-[48rem] text-left">
          <caption className="sr-only">Saved payment methods</caption>
          <thead><tr>
            {["Default", "Account Type", "Account Number", "Expiration Date", "Stripe ID", "Store Date"].map((h) => <th key={h} scope="col" className={thCls}>{h}</th>)}
            {canChange && <th scope="col" className={thCls}><span className="sr-only">Make default</span></th>}
            {canChange && <th scope="col" className={thCls}><span className="sr-only">Delete</span></th>}
          </tr></thead>
          <tbody>{methods.map((m) => (
            <tr key={m.id} className="border-b border-line">
              <td className={tdCls}>{m.isDefault ? <span className="inline-flex size-5 items-center justify-center rounded bg-teal-800 text-white"><Check aria-hidden="true" size={14} /><span className="sr-only">Default</span></span> : <span className="sr-only">Not default</span>}</td>
              <td className={tdCls}>{m.type === "us_bank_account" ? `Bank (ACH) · ${m.label}` : m.label}{m.isDefault && " (Default)"}</td>
              <td className={`${tdCls} tabular-nums`}>{m.last4 ? `•••• ${m.last4}` : "—"}</td>
              <td className={`${tdCls} tabular-nums`}>{m.expires ?? "—"}</td>
              <td className={`${tdCls} font-mono text-sm`}>{m.id}</td>
              <td className={`${tdCls} tabular-nums`}>{date(m.addedAt)}</td>
              {canChange && <td className={`${tdCls} whitespace-nowrap`}>{!m.isDefault && <InlineAction action={setDefaultPaymentMethod} fields={{ donorId, pmId: m.id }} label="Make default" />}</td>}
              {canChange && (
                <td className={`${tdCls} whitespace-nowrap text-right`}>
                  <ConfirmAction action={removePaymentMethod} fields={{ donorId, pmId: m.id }} label="Delete"
                    confirmText={`Delete ${m.type === "us_bank_account" ? "bank account" : m.label}${m.last4 ? ` •••• ${m.last4}` : ""}?`} />
                </td>
              )}
            </tr>
          ))}</tbody>
        </table>
      )}
      <p className="px-4 py-2 text-sm text-ink-soft">Card and bank numbers are held by Stripe. We never see or store them; only the last four digits show here.</p>
    </ListPanel>
  );
}
