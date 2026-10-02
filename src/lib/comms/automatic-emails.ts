/**
 * The emails the site sends by itself, and which message template each one uses (Messages → template → "Used for",
 * stored in message_assignments, migration 0020). One template can be used for several; each uses at most one.
 * `event` values are what notifyDonor looks up (see TEMPLATE_KEY in src/lib/donations/notify.ts).
 */
export const AUTOMATIC_EMAILS = [
  { event: "donation_success_one_time", label: "One-time gift", hint: "Receipt & thank-you after a one-time card gift", donation: true },
  { event: "donation_success_recurring", label: "Recurring gift payment", hint: "Receipt & thank-you each time a monthly or yearly gift is paid", donation: true },
  { event: "ach_confirmed", label: "Bank (ACH) gift cleared", hint: "Receipt & thank-you once a bank payment settles", donation: true },
  { event: "payment_failed", label: "Payment failed", hint: "When a card or bank payment doesn't go through", donation: false },
  { event: "recurring_canceled", label: "Recurring gift canceled", hint: "When a monthly or yearly gift is ended", donation: false },
  { event: "refund_issued", label: "Refund issued", hint: "When staff refund a gift", donation: false },
] as const;

export type AutomaticEmailEvent = (typeof AUTOMATIC_EMAILS)[number]["event"];
export const AUTOMATIC_EVENTS = AUTOMATIC_EMAILS.map((e) => e.event) as AutomaticEmailEvent[];
/** The three receipts/thank-yous: together, "every donation". */
export const DONATION_EVENTS = AUTOMATIC_EMAILS.filter((e) => e.donation).map((e) => e.event) as AutomaticEmailEvent[];
export const eventLabel = (event: string) => AUTOMATIC_EMAILS.find((e) => e.event === event)?.label ?? event;
