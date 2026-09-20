# Mission Giving

Donation-management platform for Ultimate Mission. Next.js 16 (App Router), TypeScript strict, Tailwind 4, Supabase, Stripe, Resend.

> **Status: Phases 1-3 built; Phase 4 partly built** (admin dashboard, donor CRM, tier management). Still to do: projects, message templates, staff/role management, settings page, deletion-request review, then Phases 5-7. See the roadmap.
> **Not yet verified against live Stripe, Supabase or Resend accounts.** Logic is unit-tested with in-memory fakes; run the test-mode steps below before trusting it.

## Local setup

```bash
npm install
cp .env.example .env.local      # fill in values; never commit
npm run dev
```

Without Supabase variables the public pages render and private routes are not gated (dev-only state). Configure Supabase to exercise auth.

### Supabase
1. Create a project. Copy URL, anon key and service-role key into `.env.local` (the service-role key is server-only).
2. Apply migrations in order (SQL editor, or `supabase db push` with the CLI): `0001_schema.sql`, `0002_rls_and_rbac.sql`, `0003_donation_flow.sql`, `0004_donor_portal.sql`, `0005_admin_crm.sql`, then `supabase/seed.sql` (fake/placeholder data only).
3. Auth > URL configuration: add `<APP_URL>/auth/callback` as a redirect URL. Enable email confirmation.
4. Initial administrator (no hardcoded password): set `INITIAL_ADMIN_EMAIL`, run `npm run admin:bootstrap`. Supabase emails an invitation; the person sets their own password. It refuses to run if a Super Admin already exists.

### Stripe (test mode)
1. Put `STRIPE_SECRET_KEY` (`sk_test_...`) and `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` in `.env.local`.
2. Dashboard > Settings > Payment methods: enable **Cards** and **ACH Direct Debit**.
3. Local webhooks: `stripe listen --forward-to localhost:3000/api/webhooks/stripe`, then copy the printed `whsec_...` into `STRIPE_WEBHOOK_SECRET`.
   Production: add an endpoint at `<APP_URL>/api/webhooks/stripe` for `payment_intent.processing`, `payment_intent.succeeded`, `payment_intent.payment_failed`, `payment_intent.canceled`, `charge.refunded`, `charge.dispute.created|updated|closed`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.updated`, `customer.subscription.deleted`.
4. Test payments use Stripe's public test values only: card `4242 4242 4242 4242` with any future expiry/CVC; declined card `4000 0000 0000 0002`. For ACH use Stripe's test bank flow (see Stripe's ACH testing docs for the success and failure test accounts).

### Stripe Customer Portal (payment-method updates)
Dashboard > Settings > Billing > Customer portal: activate it and allow **payment method updates** (cancellation there is optional; cancellations are also reconciled by webhook). Without this, "Update payment method" shows a friendly "not available" message.

### Resend
Set `RESEND_API_KEY` and `EMAIL_FROM_ADDRESS` (a verified sender). Without them emails are skipped (one log line, no recipient or content).

## Scripts
`npm run lint` · `npm run typecheck` · `npm test` (64 unit tests) · `npm run build` · `npm run test:e2e` (suite added in Phase 7)

## Donor portal (Phase 3)
`/dashboard` overview, `/dashboard/contributions` (search, status/frequency/year filters, pagination, receipt download), `/dashboard/recurring` (change amount, cancel with confirmation, update payment method via Stripe portal, ended gifts kept), `/dashboard/statements` (PDF per calendar year), `/dashboard/profile` (contact, email preferences, password, data export, deletion request).
- All donor reads use a user-scoped Supabase client, so RLS is the isolation boundary. Server actions re-load the record through that client before touching Stripe.
- Statements count only settled gifts net of refunds, in the year they **settled** (organization time zone), so a late-December ACH that settles in January lands in January.
- Cancel keeps all history; only the recurring record's status changes. Changing the amount applies from the next charge (no proration) and can be disabled with the `recurring_amount_change_enabled` setting.
- Account deletion is a **request** reviewed by staff (financial records must be retained; approval should anonymize personal fields). The staff review screen arrives in Phase 4.
- `supabase/tests/rls_isolation.sql` checks donor isolation and protected columns. **It has not been run yet**; run it against a scratch Supabase project.

## Admin portal (Phase 4, partial)
- **Dashboard** (`/admin`, `reports.view`): KPIs with previous-period comparison, recent gifts, upcoming project deadlines, and nine charts (revenue, by fund/project, one-time vs recurring, tiers, payment method, new vs returning, retention, goal progress, revenue vs expenses). Each chart has date-range controls, an accessible text summary, a "View as table" data table, and a CSV download. "Print or save as PDF" uses the browser; formatted PDF reports come in Phase 5. Metric logic is pure and unit-tested (`src/lib/admin/metrics.ts`).
- **Donor CRM** (`/admin/donors`): search, filters (status, tag, recurring, lifetime minimum), sortable columns, pagination, detail page (history, recurring, preferences, tags, internal notes, nonfinancial corrections, resend receipt), duplicate detection (`/admin/donors/duplicates`; exact email/phone or name+postal, never name alone) and an **atomic, audited merge** (`merge_donors()` SQL function: nothing is deleted, opt-outs win). CSV export needs the separate `donors.export` permission, is rate-limited, and is audited.
- **Tiers** (`/admin/tiers`): create, edit, reorder, activate/deactivate/archive (never deleted). Validation in `tier-schema.ts`.
- CSV exports neutralize spreadsheet formulas (`src/lib/csv.ts`).
- Admin data access uses the service-role client **after** `requirePermission()`; dashboards select only non-personal columns so Read-Only Reporters see aggregates, not donor identities.

## Architecture
- `src/proxy.ts` refreshes the Supabase session and redirects unauthenticated users away from `/dashboard` and `/admin`. It is **not** the security boundary: pages, actions and handlers call `requirePermission()` (`src/lib/auth/session.ts`), and Postgres RLS enforces access again.
- `supabase/migrations/0001` is the full schema. Money is integer cents plus a currency code. Deletes on donations, recurring gifts and expenses are blocked by trigger; `audit_logs` is append-only by trigger.
- `0002` seeds roles/permissions, adds `has_permission()` helpers and RLS on every table, and column-level grants so donors cannot change status or Stripe IDs. Donations, receipts and refunds have no write policies: only server code with the service role writes them.
- Security headers and CSP are in `next.config.ts`; private paths send `X-Robots-Tag: noindex`.

### How payments are reconciled
- The browser never marks a gift successful. Checkout creates a `pending` donation, Stripe confirms, and `/api/webhooks/stripe` (signature-verified) sets the status.
- The server decides the amount: a tier id resolves to the tier's stored amount; custom amounts are validated against settings (`resolveAmount`).
- Each Stripe event is claimed in `webhook_events` (primary key = event id), so redeliveries are no-ops; failures return 500 so Stripe retries. Status only moves forward (a late `processing` cannot undo `succeeded`).
- A repeated submit with the same idempotency key cannot create a second donation (unique key in the database and on the Stripe requests).
- ACH: `processing` shows as pending with a non-final "Payment Pending" acknowledgment; the final receipt and confirmation email are issued only on `succeeded`. Delayed failures move it to `failed`.
- Recurring gifts: each paid invoice creates one donation row; `customer.subscription.*` events keep status and next charge date in sync.
- Tier-specific email messages override the general template body for success emails; the subject stays the template's.

## Known limitations / to do before launch
- Donating requires a signed-in account. The guest-donation setting exists, but guest checkout and claim-by-email are **not implemented**.
- An ACH *subscription's* first payment shows as `pending` until `invoice.paid` (no intermediate `processing` state).
- Billing address collection, refunds UI and the admin reconciliation view are not built yet (Phases 3-5).
- Magic-link sign-in exists, but donor MFA and 'account claim' for guests do not.
- Cancel writes status locally as well as via webhook; in a rare race a donor could receive two cancellation emails.
- Admin: no project, message-template, staff/role, settings or audit-log screens yet; account-deletion requests have no staff review screen yet (Phase 4 remainder).
- Admin: merge from the UI supports two records at a time; the dashboard loads up to 50,000 donations in memory (move to SQL aggregates at larger scale).
- Admin: staff sign-ins via magic link are not audited (only password sign-ins). Tier date fields are interpreted as UTC.
- Public project pages don't exist yet, so the destination step only lists projects created directly in the database.
- Rate limiting is in-memory per instance (`src/lib/rate-limit.ts`). Use a shared store or Vercel Firewall in production.
- Registration uses a honeypot only; add Turnstile/hCaptcha.
- CSP allows `'unsafe-inline'` scripts; move to nonces.
- MFA and account lockout beyond rate limits are not implemented.
- Legal text, EIN, legal name, impact statistics and tier descriptions are **placeholders pending Ultimate Mission approval / legal review**.
- RLS policies and the Supabase repository have not been run against a live database; add integration tests in Phase 7.

## Roadmap
1 done · 2 done (Stripe, webhooks, receipts) · 3 done (donor portal) · 4 Admin portal (dashboard, CRM, tiers done; projects, templates, staff, settings pending) · 5 Financial reports · 6 Communications · 7 Tests, a11y, security review, deploy docs.
