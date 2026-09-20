# Testing

## Automated tests

| Command | What it runs | Needs services? |
|---------|--------------|-----------------|
| `npm run lint` | ESLint (includes React purity and accessibility rules) | No |
| `npm run typecheck` | TypeScript strict | No |
| `npm test` | 264 unit tests in `tests/unit` | No |
| `npm run build && npm run test:e2e` | 58 browser tests in `tests/e2e` (Chromium) | No |
| `E2E_LIVE=1 npm run test:e2e` | Adds the live specs in `tests/e2e/live` | **Yes** (see below) |

First run of browser tests: `npx playwright install chromium`.

### What the unit tests cover
Money and refund math; annual statements; project goals; donation amount/tier resolution; tier-specific messages; ACH pending,
failure and settlement; **Stripe webhook idempotency, ordering, retry and refund/dispute/subscription handling** (in-memory
repository, so the *logic* is tested, not the Supabase adapter); permissions matrix and last-Super-Admin guard; dashboard and
financial report calculations; CSV and PDF output; expense, tier, project, settings and template validation; upload sniffing;
audience selection and consent rules; unsubscribe tokens; webhook signatures; scheduling in the organization's time zone; email
rendering and sanitization; WCAG contrast of every design-token pair; and static security guards (every server action and admin
route checks permissions, untrusted HTML is sanitized, no secrets in source).

### What the no-service browser tests cover
For every public and auth page: one `h1`, `lang`, skip link, **axe WCAG 2.2 A/AA scan with zero violations**, and no horizontal
scroll at 375, 768 and 1280 px. Plus security headers, `noindex` on private paths, `robots.txt`, private routes redirecting when
signed out, data endpoints refusing anonymous callers, and webhook/cron endpoints refusing unsigned requests.

### What is NOT automatically tested
The Supabase repository adapter, row-level security policies, SQL functions (`merge_donors`, `anonymize_donor`, `project_totals`),
the campaign send engine, real Stripe/Resend interaction, and any donor or admin screen behind sign-in. Use the live specs and the
manual checklist below.

## Live end-to-end tests (unverified scaffolding)

`tests/e2e/live` covers: donor signs in and gives $25 by test card; a donor cannot read another donor's receipt; an admin creates
and publishes a project; a read-only user is refused; a finance user downloads the P&L as CSV and PDF. They were written without
access to real services, so expect to adjust selectors on the first run.

1. Create a **scratch** Supabase project. Apply migrations `0001`-`0008` and `supabase/seed.sql`.
2. Put test-mode credentials in `.env.local`: Supabase URL, anon and service-role keys; `STRIPE_SECRET_KEY` (`sk_test_...`),
   `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`; `STRIPE_WEBHOOK_SECRET`.
3. `npm run build`, then in another terminal `stripe listen --forward-to localhost:3100/api/webhooks/stripe` and copy its `whsec_...` into `.env.local`.
4. `E2E_LIVE=1 npm run test:e2e`.

Donations cannot be deleted through the app. Never point live tests at production. To reset a scratch database, recreate it.

## Stripe test workflows (public test values only)

Use **test mode** keys. Never commit real keys; `.env.example` lists variable names only.

| Scenario | How |
|----------|-----|
| Card success | Card `4242 4242 4242 4242`, any future expiry, any CVC |
| Card declined | `4000 0000 0000 0002` |
| 3-D Secure required | `4000 0025 0000 3155` |
| ACH success | In the payment form choose the bank option, use Stripe's **test institution** flow, or enter routing `110000000` with account `000123456789` |
| ACH failure | Same routing number with account `000111111113` (account closed) |
| ACH micro-deposit verification | Amounts `32` and `45`, or descriptor code `SM11AA` |
| Trigger webhooks | `stripe trigger payment_intent.succeeded`, `payment_intent.payment_failed`, `charge.refunded`, `charge.dispute.created`, `invoice.paid`, `customer.subscription.deleted` |

Confirm the ACH values against Stripe's current "Test bank accounts" documentation before relying on them. Test ACH payments
settle after a short simulated delay; watch the gift move from *Processing* to *Succeeded* only when the webhook arrives.

## Manual verification checklist (run once against a scratch project)

1. **Isolation first:** run `supabase/tests/rls_isolation.sql`; every line must print `PASS`.
2. Register, verify by email, sign in; sign out; password reset; magic link.
3. Give $25 once by card. Confirmation page shows *Processing* then *Succeeded* only after the webhook; receipt number and tier message appear; the PDF downloads; the gift shows in Contributions.
4. Give by ACH. Status stays **Pending/Processing** with the "not final" notice and a *pending acknowledgment* PDF; after settlement it becomes **Succeeded** and the final receipt and email arrive. Repeat with the failure account.
5. Monthly and yearly gifts: subscription appears under Recurring; change amount; cancel (history kept); update payment method (Customer Portal must be enabled).
6. Refund (partial then full) from the donor page; status changes only after Stripe's webhook.
7. Annual statement PDF shows only settled gifts net of refunds.
8. As admin: create a tier, create and publish a project, see it on `/projects`; totals rise after a gift.
9. Campaign: build an audience, confirm the count excludes non-opted-in donors, send a test, schedule, confirm; unsubscribe from the email and verify the donor is skipped; check delivery counts after the Resend webhook fires.
10. Expenses: enter, approve as a different user, attach a receipt; P&L and Statement of Activities update; CSV and PDF download.
11. Roles: sign in as each of the six roles and confirm every admin URL you should not reach redirects to *Access denied*.
12. Keyboard and screen reader pass through the donate flow (Tab order, error announcements, ACH authorization checkbox), and the admin dashboard tables.
