/**
 * PLACEHOLDER legal pages. None of this text is approved or reviewed by counsel. It exists so the site has working
 * links; replace each body with Ultimate Mission's counsel-approved text before launch.
 */
/** A section of a full policy: a heading, then paragraphs and/or bullet lists in order. */
export type LegalBlock = string | { bullets: string[] };
export interface LegalPage {
  title: string; summary: string; points: string[];
  /** Approved, final wording: hides the "draft placeholder" notice. */
  final?: boolean;
  intro?: string;
  sections?: { heading: string; body: LegalBlock[] }[];
}

export const LEGAL_PAGES: Record<string, LegalPage> = {
  privacy: {
    title: "Privacy Policy",
    summary: "How Mission Giving collects, uses, discloses and retains personal information.",
    final: true,
    points: [],
    intro: "Mission Giving is operated by Ultimate Mission (“we,” “us,” or “our”). This Privacy Policy explains how we collect, use, disclose, and retain personal information when you visit our website, create an account, make a donation, or otherwise use our services.",
    sections: [
      { heading: "1. Information We Collect", body: ["We collect personal information you provide to us, including:", { bullets: [
        "Contact information: Your name, email address, and, if provided, telephone number and mailing address.",
        "Account information: Information associated with your donor account and communication preferences.",
        "Donation records: Donation amounts, dates, frequency, designated projects or funds, receipt numbers, and payment status.",
        "Correspondence: Information you provide when you contact us for assistance or submit a request.",
      ] }] },
      { heading: "2. How We Use Your Information", body: ["We use your information to:", { bullets: [
        "Process and administer donations, including recurring contributions.",
        "Maintain your account and donation history.",
        "Send donation receipts, payment notices, and other necessary service communications.",
        "Respond to questions and support requests.",
        "Send news and project updates when you have opted in.",
        "Maintain financial records and meet applicable accounting, tax, and legal obligations.",
      ] }] },
      { heading: "3. Payment Processing", body: [
        "Credit card and bank account payments are processed by Stripe, our third-party payment processor. Mission Giving does not store full payment card numbers or bank account credentials.",
        "We maintain donation records and may receive limited payment-related information from Stripe, such as transaction identifiers, payment status, and masked payment method details, to administer donations and provide support.",
        "Stripe’s collection and handling of personal information are described in its Privacy Policy.",
      ] },
      { heading: "4. Disclosure of Information", body: [
        "We disclose personal information as necessary to service providers that support donation processing and the operation of Mission Giving. These may include payment processing, website hosting, data storage, and email delivery providers.",
        "We may also disclose information when required by applicable law or valid legal process, or when reasonably necessary to investigate fraud, address security incidents, or protect the rights and safety of donors, our organization, or others.",
      ] },
      { heading: "5. Email Communications", body: [
        "We send donation receipts and necessary payment notices by email. These transactional communications are separate from optional news and project updates.",
        "We send optional news and project updates only when you opt in. You may change your preferences at any time through your account. Opting out of optional communications does not prevent us from sending necessary messages relating to your donations or account.",
      ] },
      { heading: "6. Website Analytics", body: [
        "We use cookie-less, privacy-friendly analytics to measure page views and understand overall website usage. These analytics are configured to report aggregate usage without identifying individual visitors.",
        "This statement concerns our analytics tools. Third-party payment services may use cookies or similar technologies under their own privacy policies.",
      ] },
      { heading: "7. Data Retention", body: [
        "We retain personal information for as long as reasonably necessary to fulfill the purposes described in this policy and meet applicable legal, tax, accounting, and financial recordkeeping requirements.",
        "Certain donation and transaction records may need to be retained after you request deletion of your account. Information retained for these purposes remains subject to this Privacy Policy.",
      ] },
      { heading: "8. Access and Deletion Requests", body: [
        "You may download your information or request deletion through your account. You may also contact us using the information below for assistance with privacy requests or corrections to your information.",
        "We may verify your identity before fulfilling a request. Deletion requests are subject to applicable legal obligations and recordkeeping requirements.",
      ] },
      { heading: "9. Information Security", body: [
        "We use reasonable administrative, technical, and organizational safeguards designed to protect personal information against unauthorized access, disclosure, alteration, or loss.",
        "No method of electronic transmission or storage is completely secure, and we cannot guarantee absolute security.",
      ] },
      { heading: "10. Changes to This Policy", body: [
        "We may update this Privacy Policy to reflect changes in our services, information practices, or applicable requirements. Updates will be posted on this page with a revised effective date. We will provide additional notice when required by applicable law.",
      ] },
      { heading: "11. Contact Us", body: [
        "For questions about this Privacy Policy or requests concerning your personal information, contact:",
        "Ultimate Mission",
        "Email: ultimatemisson1@gmail.com",
      ] },
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
