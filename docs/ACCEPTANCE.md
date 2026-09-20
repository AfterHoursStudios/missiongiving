# Acceptance criteria: where each one stands

The product brief says the initial product is complete only when every criterion below is met. This is an honest status, not a
sign-off. **"Implemented" means the code exists and the logic is covered by automated tests. It does not mean it has been
exercised against real Supabase, Stripe or Resend accounts, because none were available during development.**

Legend: **U** = covered by unit tests (`npm test`). **E** = covered by automated browser tests that run with no services
(`npm run test:e2e`). **L** = live browser test written but never run (`tests/e2e/live`). **M** = must be verified by a person
against real services using the steps in `docs/TESTING.md`.

| # | Criterion | Status | Evidence / what is still needed |
|---|-----------|--------|---------------------------------|
| 1 | Donor can create and verify an account | Implemented | Register, email verification callback, sign-in. **M** (needs Supabase Auth email). |
| 2 | Donor can make a test credit-card donation | Implemented | Checkout, Stripe Elements, webhook. **L**, **M**. |
| 3 | Donor can make a test ACH donation | Implemented | Same flow with bank method. **M** (Stripe test bank accounts). |
| 4 | ACH shows the correct pending state | Implemented | Status logic and receipts: **U** (`webhooks.test.ts`, `checkout.test.ts`). UI wording: **M**. |
| 5 | One-time, monthly or yearly frequency | Implemented | Amount/frequency rules **U**. Subscriptions **M**. |
| 6 | Donor can select a placeholder tier | Implemented | Tier resolution **U**. Seed tiers in `supabase/seed.sql`. |
| 7 | Donor receives the tier-specific message | Implemented | Confirmation page and email override **U** (`checkout.test.ts`). Sending **M**. |
| 8 | Confirmed donations appear in the dashboard | Implemented | Reads via row-level security. **L**, **M**. |
| 9 | Donor can download a receipt | Implemented | PDF rendering **U**; access control **E** (anonymous rejected), **L** (cross-donor 404). |
| 10 | Donor can download an annual statement | Implemented | Statement logic and PDF **U** (`statements.test.ts`). |
| 11 | Donor can manage or cancel a recurring donation | Implemented | Actions re-check ownership; Stripe calls **M**. |
| 12 | Administrator can manage donation tiers | Implemented | Validation **U**; screens **M**. |
| 13 | Administrator can create and publish a project | Implemented | Validation and sanitization **U**. **L**, **M**. |
| 14 | Project totals update from confirmed donations | Implemented | `project_totals()` SQL and progress math **U** (math only). SQL **M**. |
| 15 | Administrator can create and send an announcement after preview and confirmation | Implemented | Audience/consent/tokens/rendering **U**. Send engine has **no automated test**. **M**. |
| 16 | Communication preferences and unsubscribes are honored | Implemented | Consent rules **U** (`comms.test.ts`); re-check before every batch (code review). **M**. |
| 17 | Administrator can record expenses | Implemented | Validation, upload sniffing, approval rules **U**. **M**. |
| 18 | Authorized staff can view a P&L and Statement of Activities | Implemented | Calculations **U** (`financials.test.ts`); outputs agree **U**. |
| 19 | Reports can be filtered and exported as PDF and CSV | Implemented | Filters, CSV, PDF **U**. Download flow **L**. |
| 20 | Users cannot access another donor's data | Implemented, **unverified in a database** | RLS policies written; `supabase/tests/rls_isolation.sql` **has never been run**. Run it first. |
| 21 | Staff permissions are enforced server-side | Implemented | Static guard **U** (`security-invariants.test.ts`) proves every action/admin route calls a permission check. Permission matrix **U**. Behavior **L**, **M**. |
| 22 | Stripe webhooks verified and idempotent | Implemented | Idempotency, ordering, failure and retry **U** (`webhooks.test.ts`); unsigned requests rejected **E**. Real signature **M** (`stripe listen`). |
| 23 | Critical flows have automated tests | Partly | 264 unit tests, 58 browser tests. Live donation/admin/report browser tests exist but are unrun. |
| 24 | Works on desktop, tablet and mobile | Verified for public and auth pages | **E**: no horizontal scroll at 375/768/1280 px; screenshots reviewed. Donor and admin pages were not browser-tested. |
| 25 | Complete setup and deployment documentation | Done | README and `docs/`. |

## Also outstanding against the brief

- **Guest donations** are not implemented (the setting is off and cannot be enabled).
- **MFA and account lockout** are not implemented (rate limiting only, in memory).
- **Bot protection** on registration/donation is a honeypot only.
- **Content that needs the organization**: logo and photography, approved impact statistics, impact descriptions per tier, testimonials, the legal pages, the About page, EIN and the legal name. All are clearly marked placeholders.
- **Image upload** works for projects (featured, gallery, sharing image). Donation-tier images are still URLs, and images have no alt-text field yet (they render as decorative).
- **Billing address** collection at checkout.
- **Formal accessibility audit**: axe finds no WCAG 2.2 AA violations on the tested pages and all design-token contrast pairs pass, but automated tools catch only part of WCAG. Screen-reader and keyboard testing of the donation flow and admin screens by a person is still needed.
- **Penetration test / independent security review**: none performed. See `docs/SECURITY_REVIEW.md`.
