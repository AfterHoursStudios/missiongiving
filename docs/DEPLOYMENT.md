# Deploying to Vercel

Prerequisites: a Vercel account, a Supabase project, a Stripe account (activated for live payments; ACH needs approval), a Resend
account with a verified sending domain, and a domain name. Do everything first in **test mode / a staging project**, and only then repeat with live credentials.

## 1. Supabase

1. Create the project. Note the URL, anon key and service-role key (**server-only**).
2. Apply migrations in order with the SQL editor or the Supabase CLI (`supabase link`, then `supabase db push`):
   `0001_schema.sql` `0002_rls_and_rbac.sql` `0003_donation_flow.sql` `0004_donor_portal.sql` `0005_admin_crm.sql`
   `0006_admin_remainder.sql` `0007_financial_reporting.sql` `0008_communications.sql` `0009_project_images.sql`. Then `supabase/seed.sql` (roles are created
   by migration 0002; the seed adds placeholder tiers, expense categories and message templates).
3. Run `supabase/tests/rls_isolation.sql` and confirm every check prints `PASS`.
4. Authentication > URL configuration: Site URL = your production URL; add `<APP_URL>/auth/callback` to redirect URLs. Require email confirmation.
5. Authentication > SMTP: configure custom SMTP (for example Resend's SMTP) so verification and reset emails are reliable; Supabase's built-in sender is heavily limited.
6. Enable MFA (TOTP) for staff accounts.
7. Storage: confirm the private `expense-receipts` bucket (migration 0007) has no public policies, and that the public-read `project-images` bucket exists (migration 0009; the app also creates it on first upload).
8. Enable backups (see `docs/BACKUP_RECOVERY.md`).

## 2. Stripe

1. Settings > Payment methods: enable **Cards** and **ACH Direct Debit**.
2. Settings > Billing > Customer portal: enable it and allow **payment method updates**.
3. Developers > Webhooks: add `<APP_URL>/api/webhooks/stripe` with these events: `payment_intent.processing`,
   `payment_intent.succeeded`, `payment_intent.payment_failed`, `payment_intent.canceled`, `charge.refunded`,
   `charge.dispute.created`, `charge.dispute.updated`, `charge.dispute.closed`, `invoice.paid`, `invoice.payment_failed`,
   `customer.subscription.updated`, `customer.subscription.deleted`. Copy the signing secret.
4. Have the ACH authorization wording approved by counsel before enabling bank payments (`/legal/ach-authorization` is a placeholder).

## 3. Resend

1. Verify your sending domain (SPF, DKIM, DMARC). Choose `EMAIL_FROM_ADDRESS` on that domain.
2. Webhooks: add `<APP_URL>/api/webhooks/resend` for `email.sent`, `email.delivered`, `email.delivery_delayed`, `email.bounced`,
   `email.complained`, `email.opened`, `email.clicked`, `email.failed`. Copy the signing secret.
3. Enable open and click tracking on the domain if you want those counts.

## 4. Vercel project

1. Import the repository. Framework preset: Next.js. Node 24.
2. Set environment variables (Production and Preview separately; use **test** keys in Preview):

| Variable | Secret? | Purpose |
|----------|---------|---------|
| `NEXT_PUBLIC_APP_URL` | no | Public site URL, no trailing slash |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | no | Supabase client |
| `SUPABASE_SERVICE_ROLE_KEY` | **yes** | Server-only admin access; bypasses row-level security |
| `STRIPE_SECRET_KEY` | **yes** | Stripe API |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | no | Stripe Elements |
| `STRIPE_WEBHOOK_SECRET` | **yes** | Verifies Stripe webhooks |
| `RESEND_API_KEY` | **yes** | Sending email |
| `EMAIL_FROM_ADDRESS` | no | Verified sender address |
| `RESEND_WEBHOOK_SECRET` | **yes** | Verifies Resend webhooks |
| `UNSUBSCRIBE_SECRET` | **yes** | Signs unsubscribe links. 16+ random characters. **Do not rotate casually**: old links stop working |
| `CRON_SECRET` | **yes** | Bearer secret for scheduled endpoints. 16+ random characters. Vercel Cron sends it automatically |
| `EMAIL_BATCH_SIZE` | no | Optional, 1-100 (default 50) |
| `INITIAL_ADMIN_EMAIL` | no | Used once by the bootstrap script |

3. Deploy. `vercel.json` schedules `/api/cron/send-campaigns` every 5 minutes and `/api/cron/retention` daily. Sub-daily crons need a
   paid Vercel plan; on the free plan change the campaign schedule to daily or call the endpoint from another scheduler.
4. Add your domain and confirm HTTPS.
5. Apply Vercel Firewall rate-limit rules for `/sign-in`, `/register`, `/reset-password`, `/donate` and `/api/unsubscribe` (the built-in limiter is per-instance memory).

## 5. First administrator (no hardcoded password)

Locally, with production Supabase credentials in `.env.local` and `INITIAL_ADMIN_EMAIL` set: `npm run admin:bootstrap`. Supabase
emails an invitation; the person sets their own password from the link and holds the Super Admin role. The script refuses to run
if a Super Admin already exists. Then use *Staff* in the admin portal to invite others, and turn on MFA.

## 6. Configure the organization

Admin > Settings: legal name, EIN, mailing address (required for campaigns), time zone, receipt and acknowledgment language
(approved by counsel), default thank-you, sender name and reply-to. Replace placeholder tier descriptions and messages with approved wording.

## 7. Smoke test (staging, then production)

Load `/`, `/projects`, `/donate` (signed out shows the sign-in prompt); register a real test account; make one small live gift you
will refund; check webhook deliveries succeed in both Stripe and Resend dashboards; open `/admin` as the Super Admin; download a
report; hit `/api/cron/send-campaigns` without the secret and confirm `401`.

## Rollback

Vercel: *Instant Rollback* to the previous deployment. Database migrations are forward-only; write a compensating migration
rather than editing applied ones. Payment status is owned by Stripe, so a rollback never loses payment truth; replay missed
webhooks from the Reconciliation page or the Stripe dashboard.
