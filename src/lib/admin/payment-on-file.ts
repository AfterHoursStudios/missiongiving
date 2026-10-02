import "server-only";
import { getStripe, isStripeConfigured } from "@/lib/stripe/client";

/** Last4 + expiry only — never the full number. Read live from Stripe (we don't store any of it) for a donor's most recent saved payment method. */
export async function loadPaymentMethodOnFile(customerId: string | null): Promise<string | null> {
  if (!customerId || !isStripeConfigured()) return null;
  try {
    const { data } = await getStripe().paymentMethods.list({ customer: customerId, limit: 1 });
    const pm = data[0];
    if (!pm) return null;
    if (pm.type === "card" && pm.card) return `${pm.card.brand.replace(/^\w/, (c) => c.toUpperCase())} •••• ${pm.card.last4} · exp ${String(pm.card.exp_month).padStart(2, "0")}/${pm.card.exp_year}`;
    if (pm.type === "us_bank_account" && pm.us_bank_account) return `Bank account •••• ${pm.us_bank_account.last4}`;
    return null;
  } catch { return null; }
}

export interface SavedPaymentMethod {
  id: string; type: "card" | "us_bank_account" | "link"; label: string; last4: string; expires: string | null; addedAt: string; isDefault: boolean;
}

/** Every saved card/bank account on the donor's Stripe customer, read live (we store none of it). Last4 and expiry only. */
export async function listPaymentMethods(customerId: string | null): Promise<{ methods: SavedPaymentMethod[]; error?: string }> {
  if (!customerId) return { methods: [] };
  if (!isStripeConfigured()) return { methods: [], error: "Payments are not configured yet." };
  try {
    const stripe = getStripe();
    const [customer, { data }] = await Promise.all([stripe.customers.retrieve(customerId), stripe.paymentMethods.list({ customer: customerId, limit: 50 })]);
    const raw = "deleted" in customer && customer.deleted ? null : customer.invoice_settings?.default_payment_method;
    const defaultId = typeof raw === "string" ? raw : raw?.id ?? null;
    const methods = data.flatMap((pm): SavedPaymentMethod[] => {
      const base = { id: pm.id, addedAt: new Date(pm.created * 1000).toISOString(), isDefault: pm.id === defaultId };
      if (pm.type === "card" && pm.card) return [{ ...base, type: "card", label: pm.card.brand.replace(/^\w/, (c) => c.toUpperCase()), last4: pm.card.last4, expires: `${String(pm.card.exp_month).padStart(2, "0")}/${String(pm.card.exp_year).slice(-2)}` }];
      if (pm.type === "us_bank_account" && pm.us_bank_account) return [{ ...base, type: "us_bank_account", label: pm.us_bank_account.bank_name ?? "Bank account", last4: pm.us_bank_account.last4 ?? "", expires: null }];
      if (pm.type === "link") return [{ ...base, type: "link", label: pm.link?.email ? `Link (${pm.link.email})` : "Link", last4: "", expires: null }];
      return [];
    });
    return { methods };
  } catch { return { methods: [], error: "Could not load payment methods from Stripe." }; }
}

export interface PaymentSummary { type: string; last4: string; expires: string | null }

/**
 * The payment method each donor's recurring gifts would charge (the Stripe default), else their most recent saved one:
 * brand + last 4 + expiry only. Live Stripe calls, so callers pass only the donors on screen (one page of a list).
 */
export async function paymentSummaries(donors: { id: string; stripe_customer_id: string | null }[]): Promise<Map<string, PaymentSummary>> {
  const withCustomer = donors.filter((d) => d.stripe_customer_id);
  if (withCustomer.length === 0 || !isStripeConfigured()) return new Map();
  const stripe = getStripe();
  const summarize = (pm: import("stripe").Stripe.PaymentMethod | null | undefined): PaymentSummary | null => {
    if (pm?.type === "card" && pm.card) return { type: pm.card.brand.replace(/^\w/, (c) => c.toUpperCase()), last4: pm.card.last4, expires: `${String(pm.card.exp_month).padStart(2, "0")}/${String(pm.card.exp_year).slice(-2)}` };
    if (pm?.type === "us_bank_account" && pm.us_bank_account) return { type: "Bank (ACH)", last4: pm.us_bank_account.last4 ?? "", expires: null };
    if (pm?.type === "link") return { type: "Link", last4: "", expires: null };
    return null;
  };
  const entries = await Promise.all(withCustomer.map(async (d) => {
    try {
      const customer = await stripe.customers.retrieve(d.stripe_customer_id!, { expand: ["invoice_settings.default_payment_method"] });
      const def = "deleted" in customer && customer.deleted ? null : customer.invoice_settings?.default_payment_method;
      const pm = def && typeof def !== "string" ? def : (await stripe.paymentMethods.list({ customer: d.stripe_customer_id!, limit: 1 })).data[0];
      const s = summarize(pm);
      return s ? ([d.id, s] as const) : null;
    } catch { return null; }
  }));
  return new Map(entries.filter((e): e is readonly [string, PaymentSummary] => !!e));
}
