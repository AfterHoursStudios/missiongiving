# Security review

**Scope:** the code in this repository at the end of Phase 7. **Method:** manual code review, static guard tests
(`tests/unit/security-invariants.test.ts`), browser checks of headers and access control (`tests/e2e/security.spec.ts`),
`npm audit`, and a search of the repository history for secrets. **Not done:** penetration testing, a review of the live
Supabase/Stripe/Resend configuration, or any test against a running database. Treat this as a developer review, not an
independent audit.

## Problems found and fixed during this review

| Finding | Fix |
|---------|-----|
| `syncGoalStatuses` was exported from a `"use server"` file, which makes it a publicly callable endpoint with no login check. Found by the new static guard. | Moved to a server-only module (`src/lib/admin/project-sync.ts`); the guard test now prevents this class of mistake. |
| With Supabase unconfigured, `/admin`, `/dashboard`, receipts and exports returned server errors instead of refusing. | `getUser()` returns null without a backend and the proxy redirects private paths to sign-in (fail closed). Covered by e2e tests. |
| Post-sign-in redirect check allowed `/\evil.com`, which browsers treat like `//evil.com` (open redirect). | Backslashes rejected in both redirect checks (Phase 4). |
| Sanitized links lost `rel="noopener noreferrer"` (allow-list omitted it). | Attribute allow-list fixed for project and email HTML; tested. |
| Staff sign-ins by magic link or invitation were not audited. | `auditStaffLogin` now runs in the auth callback too. |

## Controls verified

| Area | Control | How verified |
|------|---------|--------------|
| Authorization | Every server action and admin page/route calls a permission check; donor and receipt endpoints require a user | Static guard test, unit |
| Authorization | Permission matrix; last Super Admin cannot be removed; only Super Admins grant that role or edit the matrix | Unit |
| Data isolation | Donor data read through a user-scoped client so database policies decide access | Code review. **Policies never run against a database** (`supabase/tests/rls_isolation.sql`) |
| Payments | Webhook signature verified; idempotent; forward-only status; amount decided by server; duplicate-submit guard; refunds via Stripe with idempotency key | Unit + e2e (unsigned rejected) |
| Payments | No card/bank numbers stored | Code review; Stripe Elements keeps card entry inside Stripe's iframe (PCI SAQ A-style scope) |
| Input | Zod validation on every form; explicit column allow-lists (no mass assignment); UUID checks on ids | Unit |
| XSS | All `dangerouslySetInnerHTML` use sanitized HTML; campaign renderer escapes variables and sanitizes; subject lines stripped of newlines | Static guard + unit |
| CSV | Formula-injection neutralized | Unit |
| Uploads | Content sniffing (not filename), 5 MB cap, server-generated names, private bucket, signed URLs | Unit |
| Secrets | Only four `NEXT_PUBLIC_` variables; service-role key only in two modules; no keys in source or git history | Static guard + history search |
| Dependencies | `npm audit --omit=dev` reports 0 vulnerabilities | Run at review time |
| Headers | CSP (frame-ancestors none, object-src none), nosniff, frame deny, referrer policy, HSTS, no `X-Powered-By`; `noindex` on private paths; `robots.txt` | E2E |
| Machine endpoints | Stripe and Resend webhooks verify signatures; cron endpoints need a bearer secret (constant-time); unsubscribe needs a signed token | Unit + e2e |
| Consent | Marketing only to opted-in donors; re-checked before every batch; suppression list; one-click unsubscribe | Unit |
| Audit | Append-only by trigger; staff login, permission changes, donor edits/merges, refunds, expenses, publication, sends, exports, settings, manual adjustments | Code review |

## Open risks (ranked)

1. **Row Level Security and the SQL functions are untested against a real database.** Highest priority: apply the migrations to a
   scratch project and run `supabase/tests/rls_isolation.sql`. Application code checks permissions too, but RLS is the last line
   of defense for donor data.
2. **Broad service-role use in admin code.** Admin pages read with the service-role client after a permission check. A missed check
   means a data leak. The static guard reduces this risk but cannot prove each check is the *right* permission.
3. **No MFA and no account lockout.** Sign-in is rate limited only. Staff accounts should have MFA before launch (Supabase supports TOTP).
4. **Rate limiting is in memory.** It resets on deploy and is per server instance, so on Vercel it is weak. Use Vercel Firewall rules or a shared store.
5. **Bot protection is a honeypot only.** Add Turnstile or hCaptcha to registration and checkout (card-testing attacks target donation forms).
6. **CSP allows `'unsafe-inline'` scripts.** Move to nonce-based CSP.
7. **Donor email appears in a report URL** when filtering reports by donor. It can end up in logs and browser history. Consider a POST form.
8. **Session cookies are not HttpOnly** (Supabase's browser client needs to read them). Acceptable, but an XSS bug would expose sessions, which is why XSS controls matter.
9. **Send engine crash window**: a crash after Resend accepts a batch but before rows update could resend that batch once.
10. **Data loaded in memory** for reports, dashboard and campaign audiences: a performance and availability risk at scale, not a confidentiality one.
11. **Legal text is placeholder.** Privacy, terms, refund, ACH authorization (a NACHA requirement for ACH debits) and the tax acknowledgment need counsel.

## Before launch

Fix items 1, 3, 4 and 5 at minimum, then see `docs/PRODUCTION_CHECKLIST.md`. Commission an independent penetration test if the organization's risk policy calls for one.
