import "server-only";
import Stripe from "stripe";
import { serverEnv } from "@/lib/env";

let client: Stripe | null = null;

export function getStripe() {
  const key = serverEnv().STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  return (client ??= new Stripe(key, { maxNetworkRetries: 2, appInfo: { name: "Mission Giving" } }));
}

export const isStripeConfigured = () => Boolean(serverEnv().STRIPE_SECRET_KEY);

/** Real Stripe lookups used by the webhook handler. */
export const stripeLookups = {
  async lookupInvoicePayment(invoiceId: string) {
    const stripe = getStripe();
    const list = await stripe.invoicePayments.list({ invoice: invoiceId, expand: ["data.payment.payment_intent"] });
    const pi = list.data[0]?.payment?.payment_intent;
    if (!pi || typeof pi === "string") return { paymentIntent: typeof pi === "string" ? pi : null, method: "card" as const };
    const pm = await stripe.paymentMethods.retrieve(pi.payment_method as string).catch(() => null);
    return { paymentIntent: pi.id, method: pm?.type === "us_bank_account" ? ("us_bank_account" as const) : ("card" as const) };
  },
  async lookupChargeFee(chargeId: string) {
    const charge = await getStripe().charges.retrieve(chargeId, { expand: ["balance_transaction"] });
    const bt = charge.balance_transaction;
    return bt && typeof bt !== "string" ? bt.fee : 0;
  },
};

/** One shared Stripe product for donations; created lazily and cached in organization_settings. */
export async function getDonationProductId(
  read: () => Promise<string | null>, write: (id: string) => Promise<void>,
) {
  const existing = await read();
  if (existing) return existing;
  const product = await getStripe().products.create({ name: "Donation to Ultimate Mission" });
  await write(product.id);
  return product.id;
}
