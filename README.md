# Mission Giving

A donation-management platform for **Ultimate Mission**: donors give by card or bank (ACH), once or on a recurring schedule, and manage
their giving; staff manage donors, projects, tiers, expenses, reports and donor communications.

Built with Next.js 16 (App Router), TypeScript (strict), Tailwind CSS 4, Supabase (Postgres, Auth, Storage), Stripe, Resend and React Email.

## Status: feature-complete draft, not yet verified against live services

All seven planned phases are built. **Nothing has been run against a real Supabase, Stripe or Resend account**, because none were
available during development. What *is* verified: lint, strict type-checking and the production build; **264 unit tests** (payment,
webhook, refund, report, consent, permission and validation logic); **58 browser tests** (accessibility with axe, responsive
layout, security headers, access control on public and auth pages). What is *not*: row-level security, the SQL functions, the
campaign send engine, real payments and emails, and every screen behind sign-in.

**Before real money moves, read [`docs/ACCEPTANCE.md`](docs/ACCEPTANCE.md) (honest status of each acceptance criterion) and work
through [`docs/PRODUCTION_CHECKLIST.md`](docs/PRODUCTION_CHECKLIST.md).** Legal text, EIN, photos, impact statistics and tier
descriptions are clearly marked placeholders that Ultimate Mission must supply.

## Quick start (local)

```bash
npm install
cp .env.example .env.local        # fill in values; never commit this file
npm run dev                       # http://localhost:3000
```

With no Supabase variables the public pages render and private areas redirect to sign-in. To exercise sign-in, donations and
the admin portal you need a Supabase project and Stripe test keys:

1. **Supabase**: create a project; put its URL, anon key and service-role key in `.env.local`. Apply
   `supabase/migrations/0001` to `0008` in order, then `supabase/seed.sql` (SQL editor or `supabase db push`).
   Run `supabase/tests/rls_isolation.sql` and confirm every check prints `PASS`.
   Authentication > URL configuration: add `http://localhost:3000/auth/callback`.
2. **First administrator** (no hardcoded password): set `INITIAL_ADMIN_EMAIL`, run `npm run admin:bootstrap`, open the emailed invitation and choose a password.
3. **Stripe (test mode)**: set `STRIPE_SECRET_KEY` and `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`; enable Cards and ACH; run
   `stripe listen --forward-to localhost:3000/api/webhooks/stripe` and put the printed `whsec_...` in `STRIPE_WEBHOOK_SECRET`.
4. **Resend**: `RESEND_API_KEY` and `EMAIL_FROM_ADDRESS`. Without them transactional email is skipped and campaigns refuse to send.
5. **Optional fake data** for demos: `ALLOW_SAMPLE_SEED=yes npm run seed:sample` (refuses live Stripe keys; see `supabase/dev/remove-sample-data.sql` to clear it from a scratch database).

Environment variable names are in `.env.example`; what each is for is in [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

## Commands

| Command | Purpose |
|---------|---------|
| `npm run dev` / `build` / `start` | Develop, build, serve |
| `npm run lint` / `typecheck` | ESLint / TypeScript |
| `npm test` | Unit tests |
| `npm run build && npm run test:e2e` | Browser tests (run `npx playwright install chromium` once) |
| `npm run admin:bootstrap` | Invite the first Super Admin |
| `npm run seed:sample` | Load fake sample data (scratch databases only) |

## Documentation

| Document | Contents |
|----------|----------|
| [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) | Vercel, Supabase, Stripe and Resend setup; environment variables; cron; first admin; rollback |
| [`docs/PRODUCTION_CHECKLIST.md`](docs/PRODUCTION_CHECKLIST.md) | Everything to confirm before launch, including known open gaps |
| [`docs/TESTING.md`](docs/TESTING.md) | Test suites, what they do and do not cover, Stripe test cards and bank accounts, manual verification steps |
| [`docs/ACCEPTANCE.md`](docs/ACCEPTANCE.md) | Each acceptance criterion with honest status and evidence |
| [`docs/SECURITY_REVIEW.md`](docs/SECURITY_REVIEW.md) | Findings fixed, controls verified, ranked open risks |
| [`docs/BACKUP_RECOVERY.md`](docs/BACKUP_RECOVERY.md) | What is stored where, backups, restore and reconciliation, secret exposure |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | How each phase works: payments and webhooks, donor portal, admin, reports, communications; known limitations |

## How it fits together

- **Money is integer cents.** Stripe is the source of truth for payment status; only signed webhooks change a gift's status. ACH stays pending until it settles.
- **Authorization is enforced three times**: navigation hides links (convenience only), every page/action/route checks a permission on the server, and Postgres row-level security limits what a donor can read. A test scans the source to ensure no server action or admin route lacks a check.
- **Donors** use `/dashboard`; **staff** use `/admin` with six roles and 13 editable permissions. Guest donations are off (all donors sign in).
- **Consent**: receipts and payment notices are transactional; news and project emails go only to donors who opted in, re-checked before every batch, with one-click unsubscribe and a suppression list.

## Repository layout

```
src/app/            Pages, route handlers, webhooks, cron (App Router)
src/lib/            Business logic: donations, stripe, admin, reports, comms, auth (pure logic is unit-tested)
src/components/     Shared UI
src/emails/         React Email layouts
supabase/           migrations, seed.sql, tests/rls_isolation.sql, dev/remove-sample-data.sql
scripts/            admin bootstrap, sample data
tests/unit|e2e/     Vitest and Playwright suites
docs/               Documentation
```
