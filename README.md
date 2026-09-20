# Mission Giving

Donation-management platform for Ultimate Mission. Next.js 16 (App Router) · TypeScript strict · Tailwind 4 · Supabase · Stripe · Resend.

> **Status: Phase 1 (Foundation) complete.** Phases 2-7 are not built yet; see the roadmap. Nothing here processes payments yet.

## Local setup

```bash
npm install
cp .env.example .env.local      # fill in values; never commit
npm run dev
```

Without Supabase variables the public pages render and private routes are not gated (dev-only state). Configure Supabase to exercise auth.

### Supabase
1. Create a project. Copy URL, anon key and service-role key into `.env.local` (the service-role key is server-only).
2. Apply migrations in order: `supabase/migrations/0001_schema.sql`, `0002_rls_and_rbac.sql` (SQL editor, or `supabase db push` with the CLI), then `supabase/seed.sql` (fake/placeholder data only).
3. Auth → URL configuration: add `<APP_URL>/auth/callback` as a redirect URL. Enable email confirmation.
4. Initial administrator (no hardcoded password): set `INITIAL_ADMIN_EMAIL`, run `npm run admin:bootstrap`. Supabase emails an invitation; the person sets their own password. It refuses to run if a Super Admin already exists.

### Stripe / Resend
Not wired yet (Phase 2 and Phase 6). Variables are listed in `.env.example`.

## Scripts
`npm run lint` · `npm run typecheck` · `npm test` · `npm run build` · `npm run test:e2e` (suite added in Phase 7)

## Architecture (Phase 1)
- `src/proxy.ts` refreshes the Supabase session and redirects unauthenticated users away from `/dashboard` and `/admin`. It is **not** the security boundary: pages, actions and handlers call `requirePermission()` (`src/lib/auth/session.ts`), and Postgres RLS enforces it again.
- `supabase/migrations/0001` – full schema (all tables in the spec). Money is integer cents + currency code. Deletes on donations, recurring gifts and expenses are blocked by trigger; `audit_logs` is append-only by trigger.
- `supabase/migrations/0002` – seeded roles/permissions, `has_permission()` helpers, RLS on every table, column-level grants so donors cannot change status or Stripe IDs. Donations/receipts/refunds have no write policies: only server code with the service role writes them.
- Security headers + CSP in `next.config.ts`; private paths send `X-Robots-Tag: noindex`.

## Known limitations / to do before launch
- Rate limiting is in-memory per instance (`src/lib/rate-limit.ts`). Use a shared store or Vercel Firewall in production. Supabase also applies its own auth limits.
- Registration uses a honeypot only; add Turnstile/hCaptcha.
- CSP allows `'unsafe-inline'` scripts; move to nonces.
- Legal text, EIN, legal name, impact statistics and tier descriptions are **placeholders pending Ultimate Mission approval / legal review**.
- MFA and account lockout beyond rate limits are not implemented yet.
- RLS policies have not been run against a live database yet (no Supabase project connected); add pgTAP/integration tests in Phase 7.

## Roadmap
2 Donations (Stripe, webhooks, receipts) · 3 Donor portal · 4 Admin portal · 5 Financial reports · 6 Communications · 7 Tests, a11y, security review, deploy docs.
