# Production-readiness checklist

Tick every box before taking real donations. Items marked **[open]** are known gaps in this codebase, not just configuration.

## Must fix in code or infrastructure
- [ ] **[open]** Apply all migrations to staging and run `supabase/tests/rls_isolation.sql`; all `PASS`.
- [ ] **[open]** Run the live end-to-end specs and the manual checklist in `docs/TESTING.md` end to end (card, ACH success and failure, subscription, refund, campaign).
- [ ] **[open]** MFA required for all staff accounts; consider account lockout.
- [ ] **[open]** Shared rate limiting (Vercel Firewall rules or a shared store) on auth, donation and unsubscribe endpoints.
- [ ] **[open]** Bot protection (Turnstile or hCaptcha) on registration and checkout.
- [ ] **[open]** Nonce-based Content Security Policy (remove `'unsafe-inline'` scripts).
- [ ] **[open]** Manual accessibility pass with a screen reader and keyboard on the donate flow, donor dashboard and admin screens; fix findings.
- [ ] **[open]** Independent security review or penetration test.

## Content and legal (only the organization can supply)
- [ ] Legal organization name, EIN, mailing address, phone, contact email in Settings.
- [ ] Counsel-approved: privacy policy, terms of use, donation and refund policy, **ACH authorization**, accessibility statement, tax acknowledgment and "no goods or services" statements.
- [ ] Approved photography and logo; real impact statistics, tier impact descriptions and thank-you messages; testimonials (with consent); About text. Remove every `[PLACEHOLDER]`.
- [ ] Confirm processing-fee classification and restricted-fund treatment with the accountant. Reports carry a disclaimer; keep it.
- [ ] Data-retention policy agreed and recorded (Settings). Only webhook bookkeeping is purged automatically.

## Configuration
- [ ] Production Supabase project separate from staging; backups and point-in-time recovery on; custom SMTP configured.
- [ ] Stripe live keys; webhook endpoint and events set; ACH enabled; Customer Portal enabled; statement descriptor set.
- [ ] Resend domain verified (SPF, DKIM, DMARC); webhook set; sender address chosen.
- [ ] All environment variables set in Vercel Production; **test keys nowhere in Production**; `.env.local` never committed.
- [ ] `UNSUBSCRIBE_SECRET` and `CRON_SECRET` generated (16+ random characters) and stored in a password manager.
- [ ] Cron jobs running (check Vercel logs for `/api/cron/send-campaigns` and `/api/cron/retention`).
- [ ] Initial Super Admin created by invitation; a second Super Admin exists (so one lost account cannot lock the organization out).
- [ ] Custom domain with HTTPS; `NEXT_PUBLIC_APP_URL` matches it; auth redirect URLs updated.
- [ ] Sample/seed data absent from production (`scripts/seed-sample.ts` refuses live Stripe keys, but do not run it there at all).

## Operations
- [ ] Someone owns the daily check of *Reconciliation* (pending too long, failed webhooks, disputes).
- [ ] Stripe and Resend alert emails go to a monitored mailbox; dispute response deadlines are tracked.
- [ ] Error monitoring and log retention configured (Vercel logs at minimum). Logs deliberately contain no payloads or personal data; keep it that way.
- [ ] Dependency updates: run `npm audit` and update on a schedule; rerun all tests after upgrades.
- [ ] Restore drill performed at least once (`docs/BACKUP_RECOVERY.md`).
- [ ] Incident plan: who rotates keys, who tells donors, who contacts the payment processor.
