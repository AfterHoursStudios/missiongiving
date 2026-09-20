# Backup and recovery notes

## What holds what
| Data | Where | Backed up by |
|------|-------|--------------|
| Donors, donations, receipts, recurring gifts, expenses, settings, audit log | Supabase Postgres | Supabase backups / point-in-time recovery (PITR) |
| Expense receipt files | Supabase Storage bucket `expense-receipts` | **Not** included in database backups. Export separately |
| Payments, customers, subscriptions, refunds, disputes (source of truth for money) | Stripe | Stripe retains it; export reports periodically |
| Email delivery history | Resend (and `email_events` in Postgres) | Resend retention limits apply |
| Code and migrations | Git | Your Git host |
| Secrets | Vercel environment variables | Keep a copy in a password manager |

## Set up
1. Supabase: use a plan with **daily backups and PITR**. Note the retention window.
2. Schedule a periodic export of the `expense-receipts` bucket (Supabase CLI or S3-compatible API) to storage you control.
3. Keep a monthly Stripe export (payments and payouts) alongside the financial reports (CSV) for your accountant.
4. Record the recovery targets you are willing to accept (for example, up to 15 minutes of data loss and 4 hours to restore). These are decisions for the organization, not defaults.

## Restoring the database
1. Restore to a **new** Supabase project (or a PITR point) rather than overwriting production, then verify.
2. Confirm all eight migrations are present (`select * from supabase_migrations.schema_migrations` or compare tables) and re-run `supabase/tests/rls_isolation.sql`.
3. Point a staging deployment at the restored project and check the dashboard totals against Stripe.
4. Switch production environment variables to the restored project and redeploy. Update Stripe/Resend webhook URLs only if the app URL changed; the Supabase URL is not in them.

## Reconciling after data loss or an outage
Stripe is authoritative for payment status. After restoring:
- Stripe retries failed webhooks for several days. For older events use the **Reconciliation** page (Retry) or the Stripe dashboard's resend. Processing is idempotent, so replays are safe.
- Any gift created in the app but lost in the restore will still exist in Stripe; recreate it from the Stripe record and re-run webhook events for it.
- Compare Stripe's payments report with the P&L for the affected period.

## If a secret is exposed
- **Service-role key**: rotate immediately in Supabase, update Vercel, redeploy, and review the audit log and Supabase logs for the exposure window.
- **Stripe secret or webhook secret**: roll the key in Stripe, update Vercel, redeploy; roll webhook signing secrets separately.
- **`UNSUBSCRIBE_SECRET`**: rotating invalidates every existing unsubscribe link, so only rotate if it leaked; recipients can still unsubscribe from their account.
- **`CRON_SECRET`** and **`RESEND_WEBHOOK_SECRET`**: rotate, update Vercel and the provider, redeploy.
