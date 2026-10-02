# Mission Giving: architecture and phase notes

Donation-management platform for Ultimate Mission. Next.js 16 (App Router), TypeScript strict, Tailwind 4, Supabase, Stripe, Resend.

> Phase-by-phase design notes. For setup and status see the top-level README and the other files in `docs/`.
> **Not yet verified against live Stripe, Supabase or Resend accounts**; see `docs/ACCEPTANCE.md`.

## Local setup

```bash
npm install
cp .env.example .env.local      # fill in values; never commit
npm run dev
```

Without Supabase variables the public pages render and private routes are not gated (dev-only state). Configure Supabase to exercise auth.

### Supabase
1. Create a project. Copy URL, anon key and service-role key into `.env.local` (the service-role key is server-only).
2. Apply migrations in order (SQL editor, or `supabase db push` with the CLI): `0001_schema.sql`, `0002_rls_and_rbac.sql`, `0003_donation_flow.sql`, `0004_donor_portal.sql`, `0005_admin_crm.sql`, `0006_admin_remainder.sql`, `0007_financial_reporting.sql`, `0008_communications.sql`, then `supabase/seed.sql` (fake/placeholder data only).
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

### Resend and campaigns
- Set `RESEND_API_KEY` and `EMAIL_FROM_ADDRESS` (a verified sender). Without them transactional emails are skipped (one log line, no recipient or content) and **campaigns refuse to send**.
- Campaigns also need `UNSUBSCRIBE_SECRET` (16+ random characters; signs unsubscribe links; **do not rotate casually**, old links would stop working), `CRON_SECRET` (16+ random characters), and the organization's **mailing address** in Settings (required in the footer). `EMAIL_BATCH_SIZE` (default 50, max 100) sets recipients per provider request.
- Resend dashboard > Webhooks: add `<APP_URL>/api/webhooks/resend` for `email.sent`, `email.delivered`, `email.delivery_delayed`, `email.bounced`, `email.complained`, `email.opened`, `email.clicked`, `email.failed`; put its signing secret in `RESEND_WEBHOOK_SECRET`. Enable open/click tracking on the sending domain if you want those counts.
- Sending runs from `GET /api/cron/send-campaigns` with `Authorization: Bearer $CRON_SECRET`. `vercel.json` runs it once a day (15:00 UTC) for Vercel's free plan; on a paid plan it can run every 5 minutes, or call the endpoint from another scheduler.

## Scripts
`npm run lint` · `npm run typecheck` · `npm test` (141 unit tests) · `npm run build` · `npm run test:e2e` (suite added in Phase 7)

## Donor portal (Phase 3)
`/dashboard` overview, `/dashboard/contributions` (search, status/frequency/year filters, pagination, receipt download), `/dashboard/recurring` (change amount, cancel with confirmation, update payment method via Stripe portal, ended gifts kept), `/dashboard/statements` (PDF per calendar year), `/dashboard/profile` (contact, email preferences, password, data export, deletion request).
- All donor reads use a user-scoped Supabase client, so RLS is the isolation boundary. Server actions re-load the record through that client before touching Stripe.
- Statements count only settled gifts net of refunds, in the year they **settled** (organization time zone), so a late-December ACH that settles in January lands in January.
- Cancel keeps all history; only the recurring record's status changes. Changing the amount applies from the next charge (no proration) and can be disabled with the `recurring_amount_change_enabled` setting.
- Account deletion is a **request** reviewed by staff (financial records must be retained; approval should anonymize personal fields). The staff review screen arrives in Phase 4.
- `supabase/tests/rls_isolation.sql` checks donor isolation and protected columns. **It has not been run yet**; run it against a scratch Supabase project.

## Admin portal (Phase 4)
- **Dashboard** (`/admin`, `reports.view`): KPIs with previous-period comparison, recent gifts, upcoming project deadlines, and nine charts (revenue, by fund/project, one-time vs recurring, tiers, payment method, new vs returning, retention, goal progress, revenue vs expenses). Each chart has date-range controls, an accessible text summary, a "View as table" data table, and a CSV download. "Print or save as PDF" uses the browser; formatted PDF reports come in Phase 5. Metric logic is pure and unit-tested (`src/lib/admin/metrics.ts`).
- **Donor CRM** (`/admin/donors`): search, filters (status, tag, recurring, lifetime minimum), sortable columns, pagination, detail page (history, recurring, preferences, tags, internal notes, nonfinancial corrections, resend receipt), duplicate detection (`/admin/donors/duplicates`; exact email/phone or name+postal, never name alone) and an **atomic, audited merge** (`merge_donors()` SQL function: nothing is deleted, opt-outs win). CSV export needs the separate `donors.export` permission, is rate-limited, and is audited.
- **Tiers** (`/admin/tiers`): create, edit, reorder, activate/deactivate/archive (never deleted). Validation in `tier-schema.ts`.
- **Projects** (`/admin/projects`, public `/projects` and `/projects/[slug]`): create/edit with slug, story (sanitized HTML), gallery, goal, dates, status, featured/public flags, SEO and sharing fields; project updates; offline adjustments (explanation required, audited as `financial.adjustment`, never below zero). Each project gets its own **restricted fund**. Public pages are server-rendered, show progress/donor count (from `project_totals()`), Open Graph/Twitter metadata, a share button, and consent-only supporter names (first name + last initial, only if the organization enables recognition and the donor opted in). Public visibility is enforced by RLS. The sitemap lists public projects. Goal-reached status is synced when staff open the project list (no background job yet).
- **Message templates** (`/admin/messages`): edit subject/HTML/plain text, sanitized on save, unknown `{{variables}}` rejected, sample-data preview, test email to yourself, append-only version history with restore.
- **Staff** (`/admin/staff`, `/admin/staff/roles`): invite by email (they set their own password), add/remove roles, deactivate. Guards: the last active Super Admin can't be removed or deactivated; only Super Admins grant that role or edit the permission matrix; the Super Admin role is immutable. All changes are audited.
- **Settings** (`/admin/settings`): validated allow-list of organization fields. Guest donations and multi-currency are intentionally not switchable yet.
- **Audit log** (`/admin/audit`, `audit.view`) and **privacy requests** (`/admin/privacy`): approving a deletion runs `anonymize_donor()` (removes identity, notes, tags, dedication names and the login; retains gift records; refuses while a recurring gift is active).
- CSV exports neutralize spreadsheet formulas (`src/lib/csv.ts`).
- Admin data access uses the service-role client **after** `requirePermission()`; dashboards select only non-personal columns so Read-Only Reporters see aggregates, not donor identities.

## Financial reporting (Phase 5)
- **Expenses** (`/admin/expenses`): date, vendor, description, amount, category, project, restricted/unrestricted, payment method, reference, notes, receipt attachment, created-by and approved-by. New expenses are **pending** and excluded from reports until approved. Approval needs finance access and a *second person* (Super Admins excepted, and audited). Editing an approved expense sends it back to pending. Expenses are archived, never deleted. Categories (editable, with a functional class: program / fundraising / management) and annual **budgets** live under *Categories and budgets*.
- **Receipt uploads** go to a **private** Supabase Storage bucket (`expense-receipts`, no storage policies: server-only). Files are identified by content (magic bytes), limited to PDF/PNG/JPEG/WebP and 5 MB, stored under server-generated names, and viewed through a 60-second signed URL after a permission check.
- **Reports** (`/admin/reports`): Management P&L and Statement of Activities, on screen, printable, **CSV** and **PDF** (organization name, period, filters, generated date, page numbers, accountant-review disclaimer). Filters: date range or calendar year, fund, project, frequency, payment method, donor (by email; needs `donors.view`), donation status, expense category, restricted/unrestricted. Screen, CSV and PDF are built from the same sections so they cannot disagree. Exports are rate-limited and audited.
- **Definitions** (documented in `src/lib/reports/financials.ts`): revenue = settled gifts only (succeeded, partially refunded, refunded); disputed gifts are excluded and shown on a memo line; refunds are attributed to the *original gift's* period (per-refund dates are not stored); Stripe processing fees are an expense classed as fundraising (an assumption to confirm with your accountant); restricted/unrestricted follows the fund and the expense classification; release from restriction is not modeled; budget vs actual compares the full-year budget with approved expenses from the start of the fiscal year to the end of the selected period.
- **Offline gifts** (`/admin/offline-gift`): checks/cash/wires become settled, receipted, audited donations dated when received.
- **Refunds**: on a donor's page, for staff with `refunds.issue`. The refund is submitted to Stripe with an idempotency key; the gift's totals and status change only when the signed `charge.refunded` webhook arrives.
- **Reconciliation** (`/admin/reconciliation`): payments pending too long (card > 1 h, ACH > 7 days), recent failures, disputes, settled gifts with no final receipt, refund/status inconsistencies, incomplete or past-due recurring gifts, and failed/stalled webhook events with a safe **Retry** (re-fetches the event from Stripe and runs the same idempotent processor).

## Communications (Phase 6)
Workflow at `/admin/campaigns`: (1) choose audience, (2) write subject and message, (3) see the recipient count and why others were excluded, (4) preview the email, (5) send a test to yourself, (6) send now or schedule (organization time zone), (7) final confirmation: type **SEND**, and the count you reviewed must still match a fresh recount. Who authorized it is recorded, and the send is audited. A project page has a "Create an announcement" shortcut that pre-fills a draft; nothing sends without steps 3-7.
- **Consent is enforced twice**: when the audience is built and again right before each batch, against current data. Announcements need the donor's "news" consent; project updates need "project updates" consent. No preference row means *not* opted in. Suppressed addresses, do-not-contact donors and anyone who unsubscribed in the meantime are skipped automatically. Receipts and payment notices never go through this path.
- **Audience filters** (AND across filters, OR within a list): monthly and/or yearly donors, previous donors of chosen projects, not given in N months (only people who have given), lifetime-giving range, tags, exact region.
- **Unsubscribe**: every email has a footer link (confirmation page) and RFC 8058 one-click headers (`/api/unsubscribe`). Tokens are HMAC-signed and never expire. Unsubscribing turns off news and project emails only.
- **Suppression and bounces**: the signature-verified Resend webhook (idempotent by webhook id) records delivered/bounced/complained/opened/clicked; permanent bounces and spam complaints add the address to `email_suppressions` and mark the donor suppressed.
- **Throttling**: batches of up to 100 via Resend's batch API, at most 4 batches per cron run with a pause between requests; provider rate-limit responses put recipients back in the queue. Stalled rows are re-queued after 10 minutes.

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
- Admin: project images are uploaded from the computer (re-encoded to WebP, metadata stripped, public `project-images` bucket). The home page hero photo is uploaded in Admin > Settings (alt text required). Donation tier images are still https URLs. Story and template editors are HTML textareas with sanitization, not a WYSIWYG editor.
- Admin: the home-page impact statistics, testimonials and About text are still placeholders in code; they are not yet editable in the admin. The footer does not yet read the social links/contact email from settings.
- Reports: refunds use the original gift's date; no per-refund ledger. Fee classification, restriction release and accrual accounting are simplified; this is not GAAP/audited reporting. The dashboard and reports load up to 100,000 rows into memory.
- Reports: Stripe fees are recorded only when a payment succeeds; gifts from before the fee lookup existed, and offline gifts, have $0 fees.
- Communications: the send engine talks to Resend and Supabase and is **not covered by automated tests** (audience, consent, tokens, signatures, scheduling and rendering are). A crash after Resend accepts a batch but before rows are updated could resend that batch once. Audience data loads in memory (up to 20,000 donors). Templates for the separate transactional emails still use plain sanitized HTML; only campaigns use the React Email layout.
- Communications: open tracking is approximate. Region targeting is exact-match text on the donor's state/region; use only where lawful.
- Admin: data-retention is a recorded setting only; nothing purges data automatically.
- Admin: merge from the UI supports two records at a time; the dashboard loads up to 50,000 donations in memory (move to SQL aggregates at larger scale).
- Admin: staff sign-ins via magic link are not audited (only password sign-ins). Tier date fields are interpreted as UTC.
- Legal pages (`/legal/*`) and About are **placeholders pending legal/organization review**.
- Rate limiting is in-memory per instance (`src/lib/rate-limit.ts`). Use a shared store or Vercel Firewall in production.
- Registration uses a honeypot only; add Turnstile/hCaptcha.
- CSP allows `'unsafe-inline'` scripts; move to nonces.
- MFA and account lockout beyond rate limits are not implemented.
- Legal text, EIN, legal name, impact statistics and tier descriptions are **placeholders pending Ultimate Mission approval / legal review**.
- RLS policies and the Supabase repository have not been run against a live database; add integration tests in Phase 7.

## Roadmap
All seven phases are built: foundation, donations, donor portal, admin portal, financial reports, communications, and quality/deployment. Remaining work is verification against live services and the organization's content; see `ACCEPTANCE.md` and `PRODUCTION_CHECKLIST.md`.
