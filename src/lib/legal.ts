/**
 * PLACEHOLDER legal pages. None of this text is approved or reviewed by counsel. It exists so the site has working
 * links; replace each body with Ultimate Mission's counsel-approved text before launch.
 */
export const LEGAL_PAGES: Record<string, { title: string; summary: string; points: string[] }> = {
  privacy: {
    title: "Privacy Policy",
    summary: "How Mission Giving handles personal information.",
    points: [
      "We collect the details you give us (name, email, optional phone and address) and gift records.",
      "Card and bank details are handled by Stripe. Mission Giving does not store them.",
      "Receipts and payment notices are always emailed. News and project updates are sent only if you opt in, and you can change this any time in your account.",
      "We use cookie-less, privacy-friendly analytics that count page views without identifying individuals.",
      "You can download your data or request deletion from your account. Records required for financial and tax purposes are retained.",
    ],
  },
  terms: { title: "Terms of Use", summary: "Rules for using this website.", points: ["[Terms of Use text to be provided by Ultimate Mission.]"] },
  "refund-policy": {
    title: "Donation and Refund Policy", summary: "How donations and refunds are handled.",
    points: ["[Refund policy to be provided by Ultimate Mission.]", "Recurring gifts can be canceled at any time from your account; past gifts are not affected."],
  },
  "ach-authorization": {
    title: "ACH Authorization", summary: "Authorization for bank-account (ACH) payments.",
    points: [
      "[ACH authorization language to be provided and approved by Ultimate Mission and legal counsel.]",
      "Bank payments can stay pending for several business days. A gift is not final, and no final receipt is issued, until the bank confirms it.",
    ],
  },
  accessibility: {
    title: "Accessibility Statement", summary: "Our commitment to an accessible website.",
    points: ["We aim to meet WCAG 2.2 AA. This statement has not been through a formal audit.", "If you have trouble using any part of this site, please contact us using the details in the footer."],
  },
};
